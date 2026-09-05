# Вахта

Telegram-бот обліку робочих змін і веб-панель для безперервного виробництва 24/7 з двома 12-годинними змінами. Джерело вимог: ТЗ «Telegram-бот учета рабочих смен, MVP v1.0». Архітектура і план: [docs/architecture-and-plan.md](docs/architecture-and-plan.md).

## Структура

```
apps/
  api/          NestJS: HTTP API, Telegram webhook, SSE
  worker/       BullMQ: аутбокс, таймери, фото-пайплайн, перерахунок бонусу
  admin-web/    React + Vite: веб-панель
  qr-kiosk/     Сторінка терміналу з динамічним QR
packages/
  domain/       Чиста доменна логіка: FSM зміни, час, QR challenge, правила бонусу
  contracts/    zod-схеми команд і подій, спільні для бота, API і панелі
  db/           Drizzle-схема PostgreSQL і міграції
  i18n/         Тексти бота і панелі
  config/       Спільні tsconfig-пресети
docs/
  adr/          Архітектурні рішення
  runbooks/     Експлуатаційні регламенти
infra/compose/  Локальний стек: PostgreSQL, Redis, MinIO
```

## Локальний запуск

```bash
corepack enable
pnpm install
cp .env.example .env        # далі заповніть AUTH_SECRET, ACTIVATION_PEPPER, KIOSK_DEVICE_TOKEN
pnpm infra:up               # PostgreSQL :5432, Redis :6380, MinIO :9000/:9001
pnpm db:migrate             # застосувати міграції
pnpm db:seed                # майданчик, підрозділи, посади, зони, причини, термінал «Проходная»
pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'довгий-надійний-пароль'
pnpm dev                    # усе разом: api :3000, worker, панель :5173, термінал :5174
```

`pnpm dev` через Turborepo спочатку збирає пакети, потім тримає у watch-режимі API і воркер (`tsc --watch` + `node --watch`) і запускає Vite для панелі й терміналу. Панель показує «API online», коли API відповідає на `/health`; термінал показує QR, коли `VITE_KIOSK_DEVICE_TOKEN` у `.env` збігається з `KIOSK_DEVICE_TOKEN`, з яким запускався seed.

Типові причини «API недоступен» і «Нет связи с сервером»: не запущений API, `.env` без обовʼязкового `ACTIVATION_PEPPER`, не піднятий Docker-стек, або `REDIS_URL` вказує на 6379 замість 6380. Vite читає `VITE_*` з кореневого `.env`, не з теки застосунку.

Окремо, без Turborepo:

```bash
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter admin-web dev
pnpm --filter qr-kiosk dev
```

## Вхід у панель

Автентифікація на better-auth: email + пароль, за бажанням TOTP (Google Authenticator, 1Password). Самореєстрації немає. Першого адміністратора створює скрипт:

```bash
pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'довгий-надійний-пароль' --name 'Адмін'
```

Далі користувачів і ролі створює адміністратор у панелі або через `POST /admin/users`. Ролі за ТЗ 2: `ADMIN`, `PRODUCTION_HEAD`, `HR`, `PLANNER`, `SHIFT_MASTER`, `CLEANLINESS_CONTROLLER`, `ACCOUNTANT`, `AUDITOR`; кожна з областю `ENTERPRISE`, `SITE`, `ORG_UNIT`, `TEAM` або `ZONE`. `AUTH_SECRET` у `.env` підписує cookie і шифрує TOTP-секрети, його зміна розлогінює всіх.

## Графік змін

Модуль `apps/api/src/scheduling` реалізує ТЗ 3: версії графіка на місяць для підрозділу з життєвим циклом `DRAFT → IN_REVIEW → PUBLISHED → SUPERSEDED`. Планувальник (`PLANNER`) створює чернетку і надсилає весь місяць одним `PUT /admin/schedules/:id/assignments`; сервер обчислює планові моменти за IANA-поясом майданчика і валідує перетини, відпочинок між змінами (`SCHEDULE_MIN_REST_MINUTES`), дублі, ліміти годин і баланс день/ніч, враховуючи вже опубліковані зміни тих самих працівників у інших підрозділах. Помилки блокують `submit` і `publish`; попередження лише показуються. Публікує начальник виробництва (`PRODUCTION_HEAD`) або `ADMIN`: попередня версія стає `SUPERSEDED`, працівники з привʼязаним Telegram отримують повідомлення з кнопкою «Ознакомлен», а в чергу `timers` ставляться нагадування «зміна скоро» і повторне нагадування про ознайомлення.

```bash
# чернетка на місяць
curl -b cookies.txt -X POST localhost:3000/admin/schedules -H 'content-type: application/json' \
  -d '{"siteId":"<site>","orgUnitId":"<unit>","periodMonth":"2026-10"}'
# призначення (шаблони: GET /admin/schedules/templates?siteId=<site>)
curl -b cookies.txt -X PUT localhost:3000/admin/schedules/<id>/assignments -H 'content-type: application/json' \
  -d '{"items":[{"employeeId":"<emp>","templateId":"<DAY>","businessDate":"2026-10-01","zoneId":"<zone>"}]}'
curl -b cookies.txt -X POST localhost:3000/admin/schedules/<id>/submit
curl -b cookies.txt -X POST localhost:3000/admin/schedules/<id>/publish -H 'content-type: application/json' -d '{}'
curl -b cookies.txt localhost:3000/admin/schedules/<id>/acknowledgements
```

У панелі розділ «График» (`apps/admin-web/src/schedule`) робить те саме без curl: фільтри площадка/підрозділ/місяць, версії з бейджами статусів, сітка «працівники × дні» з вибором Д/Н у комірці та зони в рядку, кнопки «Сохранить» (PUT усього місяця), «Отправить на согласование» (недоступна, поки є помилки або незбережені зміни), «Опубликовать» / «Вернуть в черновик» для версії на погодженні, панель перевірок і таблиця ознайомлення для опублікованої версії. Тести сторінки з замоканим API: `pnpm --filter admin-web test`.

У боті працівник бачить «Мой план» (команда `/plan` або кнопка): календар місяця з денними і нічними змінами, зонами й підсумком годин, і підтверджує ознайомлення кнопкою. Воркер опитує `notification_outbox` кожні `OUTBOX_POLL_MS` і шле повідомлення через Bot API з повторами; без `TELEGRAM_BOT_TOKEN` релей вимкнений і рядки чекають у `PENDING`.

## Telegram-бот: режими і прихід за QR

`TELEGRAM_MODE=polling` (типово поза `NODE_ENV=production`): API сам забирає оновлення, публічна адреса не потрібна. `TELEGRAM_MODE=webhook`: Telegram шле оновлення на `PUBLIC_BASE_URL/telegram/webhook`, потрібні `TELEGRAM_WEBHOOK_SECRET` і публічна адреса (локально тунель `cloudflared tunnel --url http://localhost:3000`, потім `pnpm --filter api telegram:set-webhook`). Дедуплікація `update_id` є першим middleware бота і діє в обох режимах.

Потік присутності (ТЗ 4.2, FR-QR-03..06): термінал показує QR із deep link, працівник відкриває його, бот показує одну кнопку «Я на работе» або «Я ушёл» залежно від того, чи відкрита присутність. Прихід привʼязується до опублікованої зміни, чиє вікно `[початок − PRESENCE_ARRIVE_BEFORE_MINUTES, кінець]` містить момент; без такої зміни бот просить звернутись до майстра. Один QR обслуговує кількох працівників, повтор тим самим працівником за тією ж зміною повертає першу відмітку, прострочений QR відхиляється, підмінений створює подію безпеки. Резервна відмітка майстром: `POST /admin/attendance/reserve`.

## Активація працівника в боті

Потік ТЗ 2.2 реалізовано у `apps/api/src/identity`. Ендпоінти доступні ролям `ADMIN` і `HR` після входу в панель (cookie сесії).

```bash
# 1. Вхід (cookie зберігається у файл)
curl -c cookies.txt -X POST localhost:3000/auth/sign-in/email -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"довгий-надійний-пароль"}'

# 2. Картка працівника
curl -b cookies.txt -X POST localhost:3000/admin/employees -H 'content-type: application/json' \
  -d '{"personnelNumber":"000123","fullName":"Иванов Иван Иванович"}'

# 3. Код активації (показується один раз; у базі лише HMAC-хеш)
curl -b cookies.txt -X POST localhost:3000/admin/employees/<id>/activation-codes
```

Працівник відкриває `deepLink` з відповіді або надсилає код боту повідомленням, бачить замасковану картку і підтверджує привʼязку. Перепривʼязка іншого Telegram-акаунта робиться лише через `POST /admin/employees/<id>/telegram/relink` із причиною (FR-AUTH-02).

Інтеграційні тести API піднімають PostgreSQL через testcontainers. На macOS із Colima або OrbStack helper `apps/api/test/db.ts` сам бере адресу Docker-сокета з активного `docker context`.

## Команди

| Команда                        | Що робить                                                         |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm build`                   | Збірка всіх пакетів у порядку залежностей (Turborepo)             |
| `pnpm typecheck`               | Перевірка типів у кожному пакеті                                  |
| `pnpm test`                    | Vitest у кожному пакеті; у `packages/domain` є property-тести FSM |
| `pnpm lint`                    | ESLint для всього репозиторію                                     |
| `pnpm check`                   | typecheck + lint + test                                           |
| `pnpm infra:up` / `infra:down` | Локальний стек у Docker                                           |
| `pnpm db:generate`             | Згенерувати SQL-міграцію зі схеми Drizzle                         |
| `pnpm db:migrate`              | Застосувати міграції до `DATABASE_URL`                            |

## Принципи, які не обговорюються

- Серверний журнал подій є джерелом істини. Події не редагуються і не видаляються; виправлення створює компенсуючу подію.
- У відкритій зміні рівно один активний інтервал. FSM живе в `packages/domain`, інваріанти продубльовано в базі.
- Кожна команда ідемпотентна: `update_id`, `idempotency_key`, `expected_version`.
- Час зберігається в UTC; локальний час лише на виводі, за IANA tz майданчика.
- Таймери нагадують, але ніколи не закривають стани.
- Бонус рахується чистою функцією з версійованих правил і ніколи не знижується за простій чи повідомлення про небезпеку.
