# Vakhta: conventions for agents and people

Product: Telegram bot for shift accounting + admin web panel, 24/7 production, two 12-hour shifts.
Requirements: the customer's spec "ТЗ MVP v1.0" (references look like "spec 4.4", "FR-QR-03", "T-26", "AC-09").
Architecture and plan: `docs/architecture-and-plan.md`. Decisions: `docs/adr/`.

## Language

- Everything in the repository is English: code, identifiers, comments, test names, log and error messages,
  commit messages, docs, README, ADRs, runbooks, workflow files. Use Ukrainian in conversations with the project owner.
- The product UI is trilingual: Ukrainian (`uk`), English (`en`), Russian (`ru`). Every user-facing string
  lives in `packages/i18n` in all three catalogs at once; nothing user-facing is hardcoded.
  Base language per NFR-08 is `ru` (`DEFAULT_LOCALE`); keys are English.
- Language sources: employee choice in the bot (`employees.locale`, set from the Telegram client language at
  first link), `x-locale` / `Accept-Language` header for the panel, `?lang=` or browser language for the kiosk.
- API `DomainError` messages are English developer text; clients localize by the stable `code`.

## Stack

pnpm workspaces + Turborepo. TypeScript, ESM everywhere (`"type": "module"`).
API: NestJS 11 on Fastify. Worker: standalone TypeScript with BullMQ. Bot: grammY. Database: Drizzle; local/test PostgreSQL 16. Railway currently configures PostgreSQL 18 and Redis 8.2 images; verify actual engine behavior before compatibility changes. Queues: Redis + BullMQ.
Panel: React 19 + Vite. Kiosk: Vite vanilla. Tests: Vitest + fast-check + testcontainers.

## Decision priority and scope

1. **[P1]** Correctness > clear specification > architecture > maintainability > type safety >
   testability > performance > delivery speed. Safety, access boundaries and recorded shift history
   are correctness requirements.
2. **[P2]** Non-trivial work follows RECON → SPEC → DESIGN → IMPLEMENT → VERIFY → HARDEN → REPORT.
   Use `docs/templates/spec.md`. An authorized request with explicit acceptance criteria can be the
   approved specification; do not repeatedly request approval for already-authorized work. Resolve
   material ambiguity before dependent implementation. Recon/setup tasks do not change business logic.
3. **[P3]** Read `.codex/memory.md` and the affected feature memory. Use
   `docs/engineering/agent-operating-model.md` for role scopes and handoffs. Work only in the current repository on `master`. Do not create PRs, topic branches or worktrees.
   Serialize writers and Git operations; never stage, overwrite or discard another session's changes.
4. **[P4]** Preserve the existing Nest feature modules and pure domain architecture. Adopt frontend FSD
   incrementally by coherent slice. Do not invent empty layers, force frontend layers into the worker,
   or migrate Vite to Next.js/RSC as incidental cleanup. See the dated audit for the actual baseline.

## Code rules

- **[C1]** Node packages compile with `tsc` into `dist/`; `exports` point at `dist`. Relative imports in node code carry the `.js` extension.
- **[C2]** `packages/domain` never imports NestJS, Drizzle, grammY or anything with I/O. Pure functions and types only. Tests are mandatory there.
- **[C3]** Every state change goes through `packages/domain/shift-fsm`; nobody writes to `activity_intervals` outside the transition transaction.
- **[C4]** An employee never ends a shift with a button. «ЗАВЕРШИТИ ЗМІНУ» is only the label of `START_CLEANING`: it walks the
  shift to the checklist and, when the position carries none, to `READY_TO_CLOSE`. The shift closes when the exit QR is
  scanned after the report has gone (`CLOSE_SHIFT` from `READY_TO_CLOSE`), by the master with a comment from the
  operations screen, or by the end-of-day job. No bot screen may draw a close button; a test asserts that.
- **[C5]** New tables: `snake_case`, `timestamptz` for instants, `uuid` for identifiers, invariants enforced in SQL, not only in code.
- **[C6]** `domain_events` and `audit_log` are append-only. A migration that adds UPDATE/DELETE on them does not pass review.
- Codes of states, actions, reasons and statuses: `UPPER_SNAKE_CASE`, as in the spec.
- **[C7]** Never log the bot token, QR tokens, presigned URLs or the content of medical documents.
- TypeScript, React and NestJS best practices.

## Required engineering workflow

- Read `docs/engineering/standards.md` before implementation. These are project requirements.
- Search the repository first, then official documentation and maintained existing solutions. Write custom
  code only when neither fits; record why. Avoid duplicate logic and speculative abstractions.
- Use React 19 with React Compiler, TanStack Query for server state, Zustand for client state,
  TanStack tools for tables, virtualization and routing, and Tailwind CSS with shadcn/ui.
- Do not introduce `useEffect`, `useMemo`, `useRef` or `useCallback` in application-owned React code,
  including aliases, custom-hook wrappers or class lifecycle workarounds. Components render prepared
  view models and connect named actions; business rules belong outside UI.
- Apply Feature-Sliced Design to frontend feature ownership and dependency boundaries. Preserve the
  pure domain and backend module boundaries. Follow the migration rules in the engineering standard.
- For feature or workflow work, use `.agents/skills/vakhta-lean-review/SKILL.md` during design and
  before completion. Record the Lean recommendation in the feature's engineering memory.
- Keep one product document per feature in `docs/features/` and its technical decisions, evidence and
  remaining work in `docs/engineering/features/`. Use `docs/templates/feature-memory.md`.
- Unit and integration tests protect domain and state behavior; E2E tests protect complete user journeys.
  Validate desktop and mobile layouts and the Telegram worker bot's messages and keyboards.
- Verify only the product surfaces and journeys affected by the change. Do not repeat panel, kiosk
  and Telegram smoke checks for an internal change or documentation edit. For relevant live QA use
  `dev@vakhta.xyz`, 1Password and `docs/runbooks/product-qa.md`. Report blocked checks honestly.
- Ask when material requirements, domain meaning or a necessary exception are uncertain. First inspect
  the existing code and documentation so the question is concrete.

## Admin panel UI

- Use the shared calendar trigger/popover for period filters, consistent with Schedule. Do not hide
  the calendar behind an unrelated period dropdown. Reuse the same control across related pages.
- Expanded rows use the shared RowDetail reading surface: bounded width, grouped sections, wrapping
  prose, bounded scrollable long text/history and one-column mobile layouts. Keep actions near their fields.
- For every UI/UX change, capture AND visually inspect screenshots of the affected desktop and mobile
  views. Reuse the current authenticated QA session and inspect only changed surfaces. Automated tests
  alone do not replace this visual check. Record any blocked screenshot check honestly.

- Completed or resolved reports, incidents and shifts render read-only details. Hide editing textareas,
  selects, submit buttons and mutation actions; preserve photos, recorded decisions and history.
  Filters and navigation remain available. Do not show a disabled editing form as the final state.

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
**[V1] Definition of Done:** acceptance criteria have evidence; affected contracts and docs agree;
the risk-based mandatory checks in `docs/engineering/testing-baseline.md` pass. Simple edits need no
new tests, full build/check or independent review. Behavior changes need focused regression checks;
money, access, attendance, transactions, migrations and recovery need relevant invariant tests and
one independent review. Existing CI remains the full integration gate; do not duplicate it locally
by default. Repeat checks only for changed inputs, a failure or a concrete unresolved risk. Reviewers
and the integration owner reuse the writer's valid results. Record remaining risks and blocked checks;
never manufacture production employee actions or describe cached results as fresh execution.

**[V2] Owner decision, 2026-09-10 — minimize development overhead:** choose the smallest sufficient
check before running it. No ceremonial research, repeated reading of unchanged files, duplicate
reviews, tests of obvious presentation edits, or new test infrastructure for a small fix. Stop checking
when the acceptance criteria and required evidence are satisfied. Batch related changes into a coherent
delivery; do not create separate pushes/deployments for intermediate documentation. Keep feature
memory concise and update the existing document rather than duplicating the same report in many files.

**[A1] Async flows:** model ownership of cancellation, stale results, retries and idempotency explicitly.
A TypeScript annotation is not runtime validation. Preserve DB transaction boundaries; after-commit
queue work can fail independently. Verify recovery rather than assuming DB+Redis+Telegram atomicity.
Never hide errors with empty catches or resolve work as successful when required side effects failed.

## Commits and delivery

**[G1]** The owner explicitly requires direct pushes to `master`, with no PRs and no worktrees.
Work only in `/Users/leonidkuznetsov/Projects/Personal/vakhta`. Commit only task-owned paths after
verification, then push normally to `origin master`; never force-push. Preserve other sessions' edits
and coordinate a single writer/index owner. If the remote advanced, inspect and integrate without
resetting or rebasing someone else's work. Use English Conventional Commits and `CONTRIBUTING.md`.
Keep one reviewable concern per commit. `refactor`, `config` and `infra` can trigger a release.

**[G2]** Understand the full operational path: GitHub CI/release, Cloudflare hosting/DNS/storage,
Railway services/deployments/logs, and Namecheap domain/email administration. Use authenticated tools
and `docs/runbooks/platform-operations.md`; record actual access gaps instead of assuming integration.
Keep credentials in the existing CLI sessions or 1Password, never source or reports.

**[G3]** The private Telegram group "Вахта Dev" receives release changelogs from "Вахта Changelog Bot".
The existing `announce` job depends on `release` and runs only when a version is published; it does not
wait for all image/deployment jobs. Preserve this existing notification path and verify its job outcome.
Do not add duplicate announcements or send manual group messages without an explicit request.

## Code Review Rules

- **[R1]** Check acceptance criteria, domain invariants, RBAC scope and async recovery before style.
  Cite concrete changed lines and distinguish demonstrated defects from reproduction hypotheses.
- **[R2]** Check FSD dependency direction where a slice exists, deliberate public `index.ts` exports,
  TypeScript boundary validation, query/client-state ownership, hook policy and mobile accessibility.
  Do not approve an unchanged root dependency or a forwarding class merely because logic left JSX.
- **[R3]** Validate regression evidence and local vs deployed revision. Automated Codex review is
  supplemental and does not replace required deterministic checks or domain review.

## Out of MVP scope

Orders, output, OEE, equipment, payroll, ERP/MES/access-control integrations, biometrics, AI decisions. Do not add without a separate decision.
