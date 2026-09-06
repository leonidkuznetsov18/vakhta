# Продакшен: середовища, сервіси, порядок запуску

Чек-лист «що створити і що налаштувати» для пілоту. Vercel хостить статичні збірки панелі й кіоска; API і воркер живуть у контейнерах на платформі з довгоживучими процесами (вебхук бота, SSE панелі, BullMQ). Нижче варіант із мінімумом операційної роботи: Railway для контейнерів, Neon для Postgres, Upstash для Redis, Cloudflare R2 для фото.

## 1. Два середовища

| Що               | dev (локально)                                       | prod                                                                                             |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Конфігурація     | `.env` з `.env.example`; `node --env-file-if-exists` | змінні в панелі хостингу за шаблоном `.env.production.example`; файлів `.env*` у контейнері нема |
| Перевірка старту | заглушки `change-me` дозволені                       | `NODE_ENV=production` вимагає https, webhook, секрети без заглушок, S3, `METRICS_TOKEN`          |
| Інфраструктура   | `pnpm infra:up`: Postgres, Redis, MinIO у Docker     | Neon, Upstash, R2 (керовані)                                                                     |
| Telegram         | `TELEGRAM_MODE=polling`, публічна адреса не потрібна | `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_SECRET`, `telegram:set-webhook`                       |
| Cookie панелі    | http, `SameSite=Lax`                                 | https, `Secure`, `SameSite` з `AUTH_COOKIE_SAME_SITE` (lax під одним доменом)                    |
| Міграції         | `pnpm db:migrate` (drizzle-kit)                      | `node packages/db/dist/migrate.js` в образі (pre-deploy на Railway), той самий журнал            |
| `/metrics`       | відкритий                                            | лише з `Authorization: Bearer <METRICS_TOKEN>`                                                   |
| Помилки          | pino-pretty в консолі                                | pino JSON у логи платформи, Sentry за `SENTRY_DSN`                                               |
| Збірка           | `pnpm dev` (tsc --watch, Vite)                       | образи з `apps/api/Dockerfile`, `apps/worker/Dockerfile`; Vercel збирає Vite сам                 |

## 2. Що створити

| Компонент               | Сервіс                                                                      | Навіщо                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Домен                   | реєстратор + Cloudflare DNS                                                 | `panel.<домен>`, `kiosk.<домен>`, `api.<домен>` **під одним доменом**: інакше Safari не пропускає cookie сесії |
| Панель `apps/admin-web` | **Vercel**, проєкт 1                                                        | статична збірка, HTTPS; конфіг у `apps/admin-web/vercel.json`                                                  |
| Кіоск `apps/qr-kiosk`   | **Vercel**, проєкт 2                                                        | сторінка терміналу з QR; конфіг у `apps/qr-kiosk/vercel.json`                                                  |
| API `apps/api`          | **Railway**, сервіс з `apps/api/railway.json`                               | NestJS + Fastify, вебхук, SSE, `/metrics`; публічний домен `api.<домен>`                                       |
| Worker `apps/worker`    | **Railway**, сервіс з `apps/worker/railway.json`                            | аутбокс, таймери, фото-пайплайн; без публічного порту                                                          |
| PostgreSQL 16           | **Neon** (або Postgres Railway)                                             | єдине джерело істини; розширення `pgcrypto`, `btree_gist`; PITR                                                |
| Redis 7                 | **Upstash** (або Redis Railway)                                             | BullMQ і стан бота; `rediss://`                                                                                |
| S3-сумісне сховище      | **Cloudflare R2**, приватний бакет `vakhta-media`                           | фото передач і медичні документи; лише presigned GET                                                           |
| Бакет для бекапів       | **Cloudflare R2**, приватний бакет `vakhta-backups`                         | нічні `pg_dump`; lifecycle 30 днів                                                                             |
| Telegram-бот            | BotFather                                                                   | продакшен-бот окремо від dev-бота: токен, username                                                             |
| Реєстр образів          | **GHCR** (автоматично з CI)                                                 | `ghcr.io/leonidkuznetsov18/vakhta-api`, `…-worker` з тегами `sha-…` і `latest`                                 |
| Помилки                 | **Sentry** (необовʼязково)                                                  | два проєкти або один з тегом `service`; `SENTRY_DSN`                                                           |
| Моніторинг              | Railway metrics + зовнішній uptime-чек `/health`; Grafana Cloud за бажанням | алерти з `infra/monitoring/prometheus-alerts.yml`                                                              |

## 3. Змінні середовища

Повний шаблон з коментарями: `.env.production.example`. Секрети генеруються `openssl rand -base64 48` і живуть лише в панелях хостингу.

- **API (Railway):** усе з розділу «API» шаблону. Обовʼязкові в продакшені: `PUBLIC_BASE_URL` (https), `CORS_ORIGINS` (https), `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ACTIVATION_PEPPER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_SECRET`, `S3_*`, `METRICS_TOKEN`. Без будь-якого з них API не відкриє порт і напише, чого бракує.
- **Worker (Railway):** `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `S3_*`, за бажанням `SENTRY_DSN`, `MEDIA_*`.
- **Vercel, панель:** `VITE_API_URL=https://api.<домен>`.
- **Vercel, кіоск:** `VITE_API_URL`, `VITE_KIOSK_DEVICE_TOKEN` (токен терміналу з панелі «Администрирование → Терминалы»). Один проєкт на термінал.
- **GitHub (бекапи):** секрети `PROD_DATABASE_URL`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`; змінна репозиторію `DB_BACKUP_ENABLED=true`.

## 4. Порядок першого запуску

1. **Домен і DNS.** Створити записи `panel`, `kiosk`, `api` (CNAME на Vercel і Railway після створення проєктів). TLS видають Vercel і Railway.
2. **База.** Створити Postgres, виконати `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;` (Neon дозволяє власнику). Увімкнути PITR або залишити нічні бекапи з п. 6.
3. **Redis і R2.** Створити Upstash Redis (TLS) і два приватні бакети R2 з API-токеном «Object Read & Write»; на бакеті бекапів lifecycle-правило «видаляти через 30 днів».
4. **Telegram.** У BotFather створити продакшен-бота; зберегти токен і username у змінні Railway.
5. **Railway, сервіс API.** Новий сервіс із GitHub-репозиторію, root directory `/`, Config File Path `apps/api/railway.json` (Dockerfile збирається з кореня монорепо, pre-deploy запускає міграції, healthcheck `/health`). Додати змінні з п. 3, згенерувати домен і прив'язати `api.<домен>`. Після деплою `GET https://api.<домен>/health` має віддати `200`.
6. **Railway, сервіс worker.** Той самий репозиторій, Config File Path `apps/worker/railway.json`, ті самі `DATABASE_URL`/`REDIS_URL`/`TELEGRAM_BOT_TOKEN`/`S3_*`. У логах має бути `worker запущено` з `outboxRelay: true`.
7. **Довідники і адміністратор.** Одноразові команди виконуються з ноутбука в образі з GHCR зі змінними продакшену (без `NODE_ENV=production`, щоб не вмикати перевірку webhook для CLI):

   ```bash
   IMG=ghcr.io/leonidkuznetsov18/vakhta-api:latest
   docker run --rm -e DATABASE_URL -e DEFAULT_SITE_TIMEZONE $IMG node packages/db/dist/seed.js
   docker run --rm -e DATABASE_URL -e REDIS_URL -e AUTH_SECRET -e ACTIVATION_PEPPER $IMG \
     node apps/api/dist/cli/bootstrap-admin.js --email admin@<домен> --password '<довгий пароль>' --name 'Адмін'
   ```

   Змінні беруться з оточення shell (`export DATABASE_URL=...`), щоб не потрапити в історію команд. Увійти в панель і ввімкнути TOTP.

8. **Вебхук.** `docker run --rm -e DATABASE_URL -e REDIS_URL -e AUTH_SECRET -e ACTIVATION_PEPPER -e TELEGRAM_BOT_TOKEN -e TELEGRAM_MODE=webhook -e TELEGRAM_WEBHOOK_SECRET -e PUBLIC_BASE_URL $IMG node apps/api/dist/cli/set-webhook.js`. Перевірити `/start` у боті.
9. **Vercel.** Два проєкти з root directory `apps/admin-web` і `apps/qr-kiosk`; `vercel.json` уже задає framework, команди збірки з кореня монорепо, SPA-rewrite і заголовки. Додати змінні з п. 3 і домени `panel.<домен>`, `kiosk.<домен>`. `CORS_ORIGINS` в API має містити обидва.
10. **Термінал.** У панелі зареєструвати термінал, покласти токен у `VITE_KIOSK_DEVICE_TOKEN` кіоска, передеплоїти, відкрити `kiosk.<домен>` на планшеті в кіоск-режимі.
11. **Дані пілоту.** Працівники, посади, зони, графік, коди активації (панель «Администрирование»).
12. **Бекапи й алерти.** Увімкнути `DB_BACKUP_ENABLED`, запустити workflow «DB backup» вручну й переконатись, що дамп зʼявився в бакеті. Налаштувати uptime-чек `/health` і алерти з п. 7.

## 5. Образи

`apps/api/Dockerfile` і `apps/worker/Dockerfile` збираються з кореня монорепо: етап `build` ставить усі залежності й компілює лише потрібний застосунок з його workspace-пакетами, етап `runtime` містить production-залежності, `dist` і міграції, працює від користувача `node`. CI збирає обидва образи на кожному PR і публікує з `master` у GHCR з тегами `sha-<commit>` і `latest`.

Локально те саме:

```bash
docker build -f apps/api/Dockerfile -t vakhta-api:local .
docker build -f apps/worker/Dockerfile -t vakhta-worker:local .
```

Прод-стенд з готових образів (VPS або перевірка збірки): `docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.production up -d` спочатку виконує міграції, потім піднімає API і воркер.

## 6. Бекапи й відновлення

- Керована БД: PITR (Neon 7 днів на безкоштовному плані).
- Незалежно від провайдера: workflow `.github/workflows/db-backup.yml` щоночі о 02:30 UTC робить `pg_dump -Fc` і кладе у `s3://vakhta-backups/postgres/`. Скрипт `scripts/db/backup.sh` працює і з ноутбука.
- Відновлення: `scripts/db/restore.sh <дамп або s3://…> <DATABASE_URL порожньої бази>`; порядок і навчання в `docs/runbooks/recovery.md`.

## 7. Моніторинг і помилки

- `GET /health` для uptime-чеку платформи і зовнішнього сервісу (кожні 30 с).
- `GET /metrics` з `Authorization: Bearer <METRICS_TOKEN>`: підключити Grafana Cloud або будь-який Prometheus, правила в `infra/monitoring/prometheus-alerts.yml`.
- Sentry: задати `SENTRY_DSN` в API і воркері. В Sentry потрапляють лише несподівані помилки (5xx, невідомі винятки, впалі job-и); заголовки авторизації, cookie і секрет вебхука вирізаються до відправки.
- Логи pino у JSON читає Railway; фільтр `service` розділяє API і воркер.

## 8. Обмеження, про які треба знати

- **API не на Vercel.** Serverless-функції Vercel не тримають SSE і не запускають воркер; long polling бота неможливий.
- **Один API-інстанс для SSE.** Шини змін внутрішньопроцесні; при масштабуванні до кількох інстансів панель бачить події лише свого інстансу (перечитування списку все одно працює). Для масштабу винести шину в Redis pub/sub.
- **Cookie між піддоменами.** Панель і API мають бути під одним доменом (`panel.<домен>` і `api.<домен>`): тоді достатньо `SameSite=Lax`. Домени `*.vercel.app` + `*.railway.app` є різними сайтами, Safari і iOS блокують такі cookie навіть із `SameSite=None`; це лише для швидкого тесту.
- **`/metrics` за токеном, не мережею.** Railway не дає приватної адреси для зовнішнього Prometheus, тому доступ обмежено `METRICS_TOKEN`.

## 9. Перед оголошенням пілоту

- Пройти `docs/runbooks/deploy.md`, `recovery.md` (з одним навчальним відновленням), `observability.md`, `reserve-channel.md`.
- `docs/parameters.md` заповнено дефолтами пілоту; переглянути після перших тижнів.
- Юридична перевірка ПД і трудових правил країни (ТЗ 13, 18 п. 20), текст згоди при активації.
- Навантажувальний прогін `infra/load/k6-shift-boundary.js` проти staging із числами з `docs/parameters.md`.
