# Вахта: конвенції для агентів і людей

Продукт: Telegram-бот обліку змін + веб-панель, виробництво 24/7, дві 12-годинні зміни.
Вимоги: ТЗ MVP v1.0 (посилання на розділи виглядають як «ТЗ 4.4», «FR-QR-03», «T-26», «AC-09»).
Архітектура і план: `docs/architecture-and-plan.md`. Рішення: `docs/adr/`.

## Стек

pnpm workspaces + Turborepo. TypeScript, ESM усюди (`"type": "module"`).
API і worker: NestJS 11 на Fastify. Бот: grammY. База: PostgreSQL 16 + Drizzle. Черги: Redis + BullMQ.
Панель: React 19 + Vite. Термінал: Vite vanilla. Тести: Vitest + fast-check + testcontainers.

## Правила коду

- Node-пакети компілюються `tsc` у `dist/`; `exports` вказує на `dist`. Відносні імпорти в node-коді з розширенням `.js`.
- `packages/domain` не імпортує NestJS, Drizzle, grammY чи будь-що з I/O. Лише чисті функції і типи. Тести там обов'язкові.
- Кожна зміна стану проходить через `packages/domain/shift-fsm`; ніхто не пише в `activity_intervals` в обхід транзакції переходу.
- Нові таблиці: `snake_case`, `timestamptz` для моментів, `uuid` для ідентифікаторів, обмеження інваріантів у SQL, а не лише в коді.
- `domain_events` і `audit_log` append-only. Міграція, яка додає UPDATE/DELETE на них, не проходить review.
- Тексти для користувача лише через `@vakhta/i18n`; базова мова `ru` (NFR-08), ключі англійською.
- Коди станів, дій, причин і статусів: `UPPER_SNAKE_CASE`, як у ТЗ.
- Не логувати bot token, QR-токени, presigned URL, вміст медичних документів.
- TS best practice
- React best Practice
- NestJS best practice

## Команди

`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check`. Локальна інфраструктура: `pnpm infra:up`.
Перед тим як здавати зміни: `pnpm check` має бути зеленим.

## Що поза MVP

Замовлення, випуск, OEE, обладнання, зарплата, інтеграції ERP/MES/СКУД, біометрія, рішення ШІ. Не додавати без окремого рішення.
