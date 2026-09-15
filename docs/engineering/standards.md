# Engineering standards

Status: accepted project-owner requirements, 2026-09-10.

## Product outcome

Vakhta helps workers, masters and administrators understand shifts, obtain help and reduce avoidable
production time loss. Optimize for an understandable, dependable workflow under real shop-floor
conditions. Activity records alone do not prove equipment downtime, low productivity or employee fault.
Preserve the MVP boundaries and shift invariants in `AGENTS.md`.

## Organization terminology

Use the terms in [the product glossary](../../CONTEXT.md). `orgUnitId` / `orgUnitName` refer to a
unit (Ukrainian: "Підрозділ"); `zoneId` / `zoneName` refer to a zone ("Зона"). Match each field,
column, filter, tooltip, notification and export to its actual data source. A unit can contain several
zones; never use these terms interchangeably or rename stored record names as translation cleanup.

## React and presentation

Use the installed React 19 capabilities where they solve a concrete need: React Compiler, Suspense
with supported data sources, transitions, Actions and form APIs, and callback refs when appropriate.
Check the installed minor version and official documentation before using an API. Do not add every API
merely because it exists. Client-side Vite applications do not become Server Component applications
without an explicit architecture decision.

`useEffect`, `useMemo`, `useRef` and `useCallback` are forbidden in new or changed application-owned
React code. React 19 still supports them; this is our architecture policy, not a claim of deprecation.
React Compiler handles supported memoization; it does not own subscriptions or replace cleanup.
Do not disguise the forbidden hooks behind wrappers, imports, class lifecycles or disabled lint rules.
If a required integration cannot follow this rule correctly, explain the specific limitation and ask
for an explicit exception before implementing it. Do not silently modify third-party internals.

Components select prepared view models, connect named actions and render semantic markup. Keep
business decisions, sorting, grouping, date calculations, permissions, validation, request construction
and orchestration outside JSX. Ordinary presentation mapping and conditional markup remain readable.
Do not create a class per component merely to move code. Use pure functions for calculations, model
modules for state and actions, and classes only for meaningful behavior or resource ownership. Keep
`packages/domain` pure: no React, stores, requests or framework dependencies.

TanStack Query owns remote data, query keys, fetches, polling, mutations and invalidation. Reuse the
existing QueryClient and key factories. Never mirror query results into Zustand. Zustand owns client
workflow state through focused selectors and actions. Avoid unstable selector results and broad store
subscriptions. Remote persistence stays in mutations; model actions coordinate it when needed.

Use TanStack Table, Virtual and Router for their respective needs. Check compatibility with the
installed versions and React Compiler. Table row models and virtualization are separate concerns.
Do not introduce a router or virtualizer to a screen that has no corresponding requirement.

## Feature-Sliced Design and reuse

The frontend dependency direction is `app -> pages -> widgets -> features -> entities -> shared`.
Use only layers a feature needs. A slice exposes a deliberate public API; imports must not reach into
another slice's internals or a peer slice. `app` and `shared` use segments rather than business slices.
Keep business-specific concepts out of `shared`. Tests sit beside the model or feature they protect.

Apply feature ownership consistently across apps. Backend Nest modules, workers and pure domain
packages retain their appropriate architecture; do not insert UI layers into backend services. The
vanilla kiosk can adopt feature boundaries without a React rewrite. New frontend work uses FSD;
when touching legacy code, migrate the coherent affected slice without unrelated bulk moves. Record
remaining boundary debt and approved third-party integration exceptions in feature memory.

First search existing primitives, model functions, contracts, query keys and stores. Then consult
maintained libraries and primary documentation. Record a custom solution's missing capability or
constraint. DRY means sharing the same rule, not combining unrelated workflows because they look alike.

## TypeScript

Preserve strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unknown catch values
and existing ESM import conventions. Model state with discriminated unions and exhaustive handling.
Validate untrusted input at boundaries with shared Zod contracts. Prefer inference and `satisfies`;
use `unknown` with narrowing rather than `any`, unsafe assertions or non-null assertions. Reuse domain
and API types. Avoid boolean flag combinations that represent impossible states, mutable shared
objects and swallowed errors. Document public contracts, invariants and non-obvious tradeoffs, not
self-evident lines of code. Do not weaken type or lint settings to make a check pass.

## Code clarity

Owner rule, 2026-09-15: code is written to be read, tested and changed by the next person. Follow
established best practice and prefer the plain version over the clever or compact one.

- No nested ternaries. One ternary for a simple value is fine; more branches become an early return,
  a named helper, a lookup map or an exhaustive `switch`.
- No `any`, including `as any` and `any[]`. Use `unknown` with narrowing, generics or the shared type.
- Keep nesting shallow: guard clauses and early returns instead of `if`/`else` pyramids; no more than
  two levels of nested blocks or loops in one function. Extract a named function instead.
- One function does one thing at one level of abstraction. Long parameter lists and boolean flags that
  switch behavior become an options object or separate functions.
- Keep complexity proportional to the data. Avoid O(n²) work that can be O(n): do not call `find`,
  `filter`, `includes` or `indexOf` over a collection inside a loop over another; build a `Map`/`Set`
  index once. Do not query the database per row (N+1); batch or join. Do not repeat the same derivation
  on every render or iteration when it can be computed once.
- No magic strings for codes. Each set of states, actions, reasons, statuses, kinds or roles has one
  enum-like source: an `as const` object whose keys equal the codes (`ShiftState.READY_TO_CLOSE`),
  its derived union type, and the `z.enum` / `pgEnum` built from its values. Compare, switch and assign
  through the constant, never a raw string literal. Do not add TypeScript `enum` or `const enum`: they
  do not fit `verbatimModuleSyntax`, `z.enum` or `pgEnum`. Migrate existing `as const` arrays and raw
  literals when touching the affected slice, not in unrelated bulk edits.
- Comments are short and plain. Name things so the code explains what it does; a comment explains
  why — an invariant, a spec reference, a non-obvious tradeoff — in one or two sentences. No restating
  the code, no multi-paragraph essays, no commented-out code, no history that belongs in Git.
- Pure logic is separated from I/O and UI so it can be unit-tested without mocks.
- Reviewers treat violations as defects, not style preferences. When touching existing code that breaks
  these rules, simplify the affected function rather than extending the problem.

## Interface and verification

Disable actions that would make no change. Save/apply require a meaningful difference from the
saved/applied baseline; reset/clear require something to restore in the draft or applied state.
Returning to the baseline disables the action again. Derive availability in the owning model,
use native `disabled` and guard the handler, including keyboard submission. Compare normalized
values where submission normalizes them. Explicit refresh and retry remain separate useful actions.

Use the existing Tailwind/shadcn foundation where suitable and keep localization catalogs. The owner
permits other suitable components, Sheets, custom composition and purposeful colors (2026-09-13);
choose the best interaction for the workflow instead of requiring expanded sub-rows. Preserve keyboard and
screen-reader access. Mobile is a primary workflow: check narrow viewports, touch controls, readable
status, inline errors, the on-screen keyboard and long translated text. Keep the primary action obvious;
do not make tooltips the only way to understand an essential control.
Do not duplicate explanatory text in both a tooltip and its surrounding card or form. Keep the
explanation in the tooltip; retain concise field labels and distinct actionable validation messages.

Use shared `IconButton` with an icon size for familiar contextual actions such as help, search,
copying, importing and inline editing. Supply a localized label and tooltip; preserve its keyboard
help and mobile target size. Keep text for primary saves, consequential workflow choices, bulk counts,
disclosure titles and distinctions that share an icon (for example CSV versus XLSX). Do not hide
labels automatically based on character count or convert every action to an unexplained icon.

Separate functional zones whenever a detail mixes submitted evidence, reviewer input and recorded
history. Use shared `WorkflowSection` with a concise localized heading, consistent padding and a
visible boundary. Employee answers, messages and attachments stay together; editable decision fields
and their submit actions belong in a separate zone; recorded decisions never appear as employee data.
Place source material before decision input in DOM/mobile order. Use subtle action emphasis without
reusing success/error colors to identify ownership. Configuration separates the worker preview from
review rules. Compact settings can use labeled divider rows instead of additional cards. Do not force
equal-height empty panels or add scroll regions merely to achieve symmetry. Preserve read-only final
states and all historical evidence.

Test business rules, state transitions, query invalidation, permissions and error recovery at the
appropriate unit/integration level. E2E covers authentication and complete critical journeys across
panel, kiosk and bot, including failures and retries. Avoid tests that merely mirror implementation.
A changed journey needs proportionate documentation and evidence. Follow the risk-based mandatory
checks in `testing-baseline.md`; do not run a full local `pnpm check` or all-surface live QA by default.
Record only relevant browser/bot scenarios and blocked checks. Existing API E2E tests are not
evidence of browser or Telegram visual coverage.

## Sources

- [React Compiler](https://react.dev/learn/react-compiler/introduction)
- [React hooks](https://react.dev/reference/react/hooks)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Zustand](https://zustand.docs.pmnd.rs/getting-started/introduction)
- [FSD layers](https://fsd.how/docs/reference/layers/)
- [TypeScript strict checks](https://www.typescriptlang.org/tsconfig/strict.html)

## HTTP contracts, forms and persisted preferences

Axios is the panel HTTP transport. `shared/api` owns credentials, locale, cancellation, binary
responses and normalized `ApiError` values. Feature/entity APIs own endpoints and Zod boundary
validation. Use `apiRequest`/`apiBlob`; the root `apiFetch` is a compatibility adapter for existing
callers. Never create a second interceptor stack or log Axios request/config/response objects.
Pass Query's AbortSignal through generated and ordinary requests; retain cancellation rather than
turning it into a user error. Query owns retries: mutations have no automatic retry. Keep HTTP status
and stable domain code; localize by code/kind and use a generic localized fallback for unknown errors.

For migrated REST resources, derive Nest DTO/OpenAPI metadata from `@vakhta/contracts` through
nestjs-zod, then generate Axios functions with Orval. Do not edit generated code. Run `pnpm api:generate`
after changing the actual controller/contracts; CI `pnpm api:check` rejects drift. The initial resource
is employee pagination/import. Generated TypeScript is not runtime validation: parse responses in the
entity API, and preserve server guards, scope filtering and expected status/error envelopes.

TanStack Form owns ordinary form values, field metadata and validation. Reuse Zod command contracts;
Query owns the submission, and the feature model owns version conflicts. Baselines follow explicitly
acknowledged saved versions; Reset restores that baseline. Keep failed drafts and require an explicit
retry. Never silently overwrite a newer version. Use named model actions and prepared field feedback.
The profile section editor is the reference; compound scheduling workflows retain their domain models.

Persist client preferences through a feature-owned Zustand persist store with versioned Zod schemas,
explicit actor scope and a migration policy. Unavailable/corrupt storage falls back to memory/defaults
with safe diagnostics. Do not import legacy unowned values into a new actor's scope. The audit facet
store is the reference. Browser preferences never establish authorization or mirror Query server data.

## Dates, queries and live updates

Distinguish instants (ISO timestamp/Date), business dates (`YYYY-MM-DD` in the site's IANA timezone),
local clock times and durations. Use the existing pure domain time functions in `packages/domain/src/time`
(`businessDateOf`, shift planning/window functions) with explicit timezone for business rules. Luxon
already owns those conversions and DST behavior. Reuse existing display/date-fns helpers in the panel;
do not derive a business day with UTC `toISOString().slice(0, 10)` or add another date library.
A duration carries its unit via `formatDuration` unless a column header already supplies the unit.

Co-locate reusable `queryOptions` factories with feature/entity API models; use the existing key
factories and explicit filters in identity. The complete employee directory factory preserves its
existing invalidation prefix, consumes the signal and rejects repeated cursor cycles. Paginated
requests must not silently show a partial roster as complete. Keep cached data during refresh and
expose loading, offline/paused, error/retry and successful-empty states separately.

SSE is an invalidation signal, not a second data cache or an Axios JSON request. The existing
`lib/live.ts` EventSource adapter owns cookie credentials, reconnect status and close-on-unsubscribe;
its application-owned effect is explicit legacy debt and is not permission to add hooks elsewhere.
When migrating that slice, require one subscription owner per cache scope, cleanup on logout/scope
change, bounded reconnect behavior, and Query invalidation/refetch after a connection gap. Do not
claim EventSource reconnection replays missed domain events without a server replay contract.

## Logging, commands and delivery guarantees

Nest request logs use nestjs-pino; Fastify supplies a validated/generated UUID and Pino reuses it.
Allowlist request ID/method and response status, redact credentials, and sanitize both `err` and
`error`, including Pino's implicit message extraction. Keep structured event names and safe identifiers;
never pass payloads, raw URLs or arbitrary upstream messages as free-form log text. Background work
correlates by durable task UUID: admission is `task_intent_staged`, not proof of transaction commit;
worker outcomes include task UUID, kind, attempt and persisted completed/retried/lost classification.
Diagnostic observer failure cannot change a successfully persisted task outcome.

Use scheduling command receipts as the reference for consequential commands: authenticate/authorize,
canonicalize and fingerprint the actor-bound input, serialize matching idempotency keys, commit
business effects/events/task intents/validated receipt together, reject mismatched key reuse, and
recheck authorization on replay. Do not introduce one generic receipt abstraction across incompatible
legacy flows. Requests/Incidents receipt migrations remain explicit debt.

Each outbox notification commits independently under SKIP LOCKED; a pass attempts each row at most
once even for zero retry_after. Revalidate reminder eligibility at delivery. Earlier SENT receipts
survive later failures. Telegram acceptance followed by receipt persistence failure is ambiguous and
can duplicate that one notification on retry; database locks do not provide exactly-once delivery.

Telegram update records distinguish PROCESSING, COMPLETED and FAILED without saving private payloads.
COMPLETED means the middleware returned, not proof every requested business outcome succeeded.
Interrupted PROCESSING is ambiguous. Retain at-most-once admission and no automatic replay while
handlers contain non-idempotent effects. This is diagnostic outcome tracking, not a durable replayable
inbox; a future inbox must define each handler's transactional/recovery boundary and admission failure
response before changing webhook acknowledgement behavior.

## Architecture and verification tooling

Scoped ESLint boundaries enforce downward dependencies, feature/entity public APIs and the hook policy
for employee import/profile, audit filters, employee entity, shared API and locale config. Legacy root
API/UI adapters remain explicit migration dependencies; these rules do not certify the entire panel.
`pnpm test:architecture` exercises prohibited imports/aliases. Expand the scope with coherent migrations.

Use MSW for new transport fixtures and Playwright/axe for complete browser journeys. The profile fixture
uses real UI/providers with synthetic HTTP responses; it is not part of the production entrypoint.
CI checks generated contract drift and runs desktop/mobile Chromium journeys. `pnpm audit:unused`
(Knip) and `pnpm audit:fsd` (Steiger) are advisory inventories: check dynamic entrypoints, previews,
workers, migrations, public APIs and domain ownership before removing anything.
