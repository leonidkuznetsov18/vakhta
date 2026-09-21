# Runbook: резервне копіювання й відновлення

Джерела: ТЗ 13 (строки зберігання, юридична блокада), NFR-05, ADR-0001, ADR-0006.

## Що зберігається де

| Дані                                            | Сховище                     | Резервування                                          |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Журнал подій, аудит, проєкції, довідники, права | PostgreSQL 16               | керована БД з PITR ≥ 7 днів або `pg_dump -Fc` щоночі  |
| Фото передач, медичні документи                 | приватний S3-сумісний бакет | versioning + lifecycle за `MEDIA_RETENTION_DAYS`      |
| Черги таймерів, стан бота між кроками           | Redis                       | не резервується: таймери відновлюються перечитуванням |
| Сесії панелі                                    | PostgreSQL (`auth_session`) | разом із БД                                           |

Redis навмисно не є джерелом істини (ADR-0011): після його втрати воркер не втрачає дані, а лише пропускає відкладені нагадування; оперативний стан у Postgres.

## Резервне копіювання БД

- Керована БД: PITR провайдера (Neon).
- Незалежно від провайдера: workflow `.github/workflows/db-backup.yml` щоночі о 02:30 UTC виконує `scripts/db/backup.sh`: `pg_dump --format=custom --no-owner --no-privileges` і завантаження в `s3://<BACKUP_S3_BUCKET>/postgres/vakhta-<UTC-мітка>.dump`. Потрібні секрети репозиторію `PROD_DATABASE_URL`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` і змінна `DB_BACKUP_ENABLED=true`. Ротація: lifecycle-правило бакета на 30 днів.
- Перевірка: у GitHub Actions останній запуск «DB backup» зелений, у бакеті є файл за сьогодні розміром більше кількох кілобайт.

## Відновлення БД

1. Зупинити API і воркер (Railway: «Remove» деплою або масштабувати до 0), щоб не писати в стару базу.
2. Створити порожню базу тієї ж мажорної версії (Neon: нова гілка або база) і виконати `scripts/db/restore.sh s3://<бакет>/postgres/vakhta-<мітка>.dump <DATABASE_URL нової бази>`. Скрипт створює розширення `pgcrypto` і `btree_gist`, робить `pg_restore --exit-on-error` і друкує кількість подій та останній `occurred_at`: це межа відновлених даних.
3. Перемкнути `DATABASE_URL` API і воркера на нову базу, запустити; pre-deploy міграції ідемпотентні.
4. Події Telegram, що надійшли після точки відновлення, втрачено; працівники побачать актуальний екран при наступній дії, майстер оформляє корекції (FR-COR-03) за резервним каналом (`reserve-channel.md`).

## Відновлення фото

Обʼєкти в S3 адресуються `media_objects.storage_key`; при втраті бакета фото лишаються в Telegram щонайменше кілька днів: повторно поставити job у чергу `media` для рядків із `processed_at IS NULL` після скидання `storage_key`.

## Юридична блокада видалення

Строки зберігання задає `MEDIA_RETENTION_DAYS` і політика замовника (ТЗ 18 п. 16). Для спорів, що вийшли за межі бонусного періоду, видалення блокується: не запускати lifecycle-очистку для ключів, на які посилаються відкриті звернення `APPEAL` або спори `DISPUTED`.

## Навчання (ТЗ 16: recovery-тест)

Раз на квартал, 20 хвилин, без впливу на прод:

```bash
export DATABASE_URL_DRILL=postgres://...vakhta_drill   # порожня база
scripts/db/restore.sh s3://vakhta-backups/postgres/<останній>.dump "$DATABASE_URL_DRILL"
docker run --rm -p 3100:3000 -e DATABASE_URL="$DATABASE_URL_DRILL" -e REDIS_URL=redis://host.docker.internal:6380 \
  -e AUTH_SECRET -e ACTIVATION_PEPPER ghcr.io/leonidkuznetsov18/vakhta-api:latest
curl -s localhost:3100/health
```

Успіх: `/health` віддає `200`, у базі кількість подій збігається з продом на момент дампа, панель проти :3100 відкриває «Аудит» і «Оперативная смена». Результат і дату записати в журнал навчань.

## Multi-tenant databases (specs/011)

The nightly job also dumps the control registry `vakhta_control` and every tenant database
`vakhta_t_<slug>` found on the cluster, one object each:
`s3://<bucket>/postgres/<database>/<database>-<UTC stamp>.dump`. The pilot database keeps its
historical key `postgres/vakhta-<stamp>.dump`. A failed tenant dump does not stop the others; the
job still fails at the end and names the database. `BACKUP_ALL_DATABASES=false` restores the old
single-dump behaviour. The bucket lifecycle rule must cover the whole `postgres/` prefix.

### Restore one tenant

A tenant database belongs to its role `vakhta_<tenant id without dashes>_app`; restored objects
must belong to that role again, otherwise the tenant loses access. Only that tenant is affected.

1. Suspend the tenant in Vakhta Control (Danger zone) with the reason. Its panel, bot and kiosk stop
   within one registry refresh; other tenants keep working.
2. As the cluster administrator create an empty database owned by the tenant role:
   `CREATE DATABASE vakhta_t_<slug>_restore OWNER "vakhta_<id>_app";`
3. Restore as the administrator on behalf of the role:
   `RESTORE_ROLE=vakhta_<id>_app scripts/db/restore.sh s3://<bucket>/postgres/vakhta_t_<slug>/<file>.dump <admin URL of vakhta_t_<slug>_restore>`.
   The script creates the extensions itself and skips their dump entries, then prints the event
   boundary.
4. Swap the databases so the tenant's stored URL stays valid:
   terminate connections to both databases, then
   `ALTER DATABASE vakhta_t_<slug> RENAME TO vakhta_t_<slug>_replaced_<stamp>;` and
   `ALTER DATABASE vakhta_t_<slug>_restore RENAME TO vakhta_t_<slug>;`.
5. Resume the tenant in Vakhta Control. Keep the replaced database until the tenant confirms the
   data, then drop it.

The control registry restores the same way without `RESTORE_ROLE`; stop `control-api` first, and keep
`CONTROL_ENCRYPTION_KEY` unchanged, because the registry holds tenant secrets encrypted with it.

### Drill record

2026-09-21, local PostgreSQL 16 container, committed migrations of `origin/master` `3cafb2f`:
pilot, control registry and one tenant database owned by its role were dumped by `backup.sh`
(263,865, 40,587 and 285,227 bytes). The tenant dump was restored with `RESTORE_ROLE` into a
scratch database: sites 1, positions 5, reason codes 28, shift templates 2, identical to the
source; 0 objects owned by another role. After the rename swap the tenant role connected with its
original URL, re-ran migrations and wrote a row. The registry dump restored with 1 tenant. No
production database or bucket was used; a production drill remains an owner-scheduled task.
