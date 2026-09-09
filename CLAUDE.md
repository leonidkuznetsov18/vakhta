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

## Panel state

- Server state goes through TanStack Query (`useQuery`/`useMutation`): fetching, polling and
  invalidation live there, never in a `useEffect` that calls the API by hand. An effect is for
  synchronising with something outside React, not for loading data.
- Client state goes through zustand stores, not context providers, `useReducer` or a pile of
  `useState`. Hooks off a store are easier to read, to test and to extend, and they do not re-render
  a whole subtree.
- Touching an old screen means bringing that part of it over: leave the file on the current rules
  rather than adding to the old shape.

## Admin panel UI

- Every component, color, size and spacing comes from shadcn/ui (https://ui.shadcn.com); components are copied into
  `apps/admin-web/src/components/ui`. No bespoke CSS where a shadcn primitive exists.
- Long lists and tables are paginated. Forms validate input with the zod contracts and show inline errors.
- Every non-obvious control has an information tooltip; tooltip texts live in `@vakhta/i18n` in all three languages.
- Every interactive element has visible hover, active and focus states. The interface must be usable without a manual.
- The details of a table row open as a sub-row under it (`DataTable`'s `expanded`), never in a side sheet: the row
  stays visible, and the reader keeps their place in the list. A sheet or a dialog is for what is not a row — creating
  a record, the questions and answers, a document. The sub-row never repeats what the row's own columns already show.
- A number carries its unit where it is read: a duration is formatted (`formatDuration`), not printed as bare minutes,
  unless the column header already names the unit.

## Commands

`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check`. Local infrastructure: `pnpm infra:up`.
Before handing over changes `pnpm check` must be green.

## Out of MVP scope

Orders, output, OEE, equipment, payroll, ERP/MES/access-control integrations, biometrics, AI decisions. Do not add without a separate decision.
