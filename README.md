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

## Швидкий старт

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up
pnpm build
pnpm test
```

Запуск API після збірки:

```bash
node apps/api/dist/main.js
```

Панель і термінал у режимі розробки:

```bash
pnpm --filter admin-web dev
pnpm --filter qr-kiosk dev
```

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
