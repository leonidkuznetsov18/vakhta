# Vakhta: conventions for agents and people

Product: Telegram bot for shift accounting + admin web panel, 24/7 production, two 12-hour shifts.
Requirements: the customer's spec "ТЗ MVP v1.0" (references look like "spec 4.4", "FR-QR-03", "T-26", "AC-09").
Architecture and plan: `docs/architecture-and-plan.md`. Decisions: `docs/adr/`.

## Language

- Everything in the repository is English: code, identifiers, comments, test names, log and error messages,
  commit messages, docs, README, ADRs, runbooks, workflow files. Only Ukrainian or English is used in chat.
- The product UI is trilingual: Ukrainian (`uk`), English (`en`), Russian (`ru`). Every user-facing string
  lives in `packages/i18n` in all three catalogs at once; nothing user-facing is hardcoded.
  Base language per NFR-08 is `ru` (`DEFAULT_LOCALE`); keys are English.
- Language sources: employee choice in the bot (`employees.locale`, set from the Telegram client language at
  first link), `x-locale` / `Accept-Language` header for the panel, `?lang=` or browser language for the kiosk.
- API `DomainError` messages are English developer text; clients localize by the stable `code`.

## Stack

pnpm workspaces + Turborepo. TypeScript, ESM everywhere (`"type": "module"`).
API and worker: NestJS 11 on Fastify. Bot: grammY. Database: PostgreSQL 16 + Drizzle. Queues: Redis + BullMQ.
Panel: React 19 + Vite. Kiosk: Vite vanilla. Tests: Vitest + fast-check + testcontainers.

## Code rules

- Node packages compile with `tsc` into `dist/`; `exports` point at `dist`. Relative imports in node code carry the `.js` extension.
- `packages/domain` never imports NestJS, Drizzle, grammY or anything with I/O. Pure functions and types only. Tests are mandatory there.
- Every state change goes through `packages/domain/shift-fsm`; nobody writes to `activity_intervals` outside the transition transaction.
- New tables: `snake_case`, `timestamptz` for instants, `uuid` for identifiers, invariants enforced in SQL, not only in code.
- `domain_events` and `audit_log` are append-only. A migration that adds UPDATE/DELETE on them does not pass review.
- Codes of states, actions, reasons and statuses: `UPPER_SNAKE_CASE`, as in the spec.
- Never log the bot token, QR tokens, presigned URLs or the content of medical documents.
- TypeScript, React and NestJS best practices.

## Commands

`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check`. Local infrastructure: `pnpm infra:up`.
Before handing over changes `pnpm check` must be green.

## Out of MVP scope

Orders, output, OEE, equipment, payroll, ERP/MES/access-control integrations, biometrics, AI decisions. Do not add without a separate decision.
