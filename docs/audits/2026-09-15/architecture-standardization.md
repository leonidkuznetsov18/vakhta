# Architecture and dependency standardization audit

Date: 2026-09-15. Status: recommendations, not an approved implementation plan.

## Executive decision

Keep the current React/Vite, Nest/Fastify, Drizzle/PostgreSQL, Zustand, TanStack Query and Router
foundation. The highest return is a consistent contract, form, persistence and async execution
architecture. Replacing entire frameworks would leave those ownership problems largely unchanged.

Recommended next additions, introduced separately through bounded pilots:

1. `@tanstack/react-form` with existing Zod for substantial forms.
2. `@nestjs/swagger` + `nestjs-zod`, then Orval for contract-derived REST clients.
3. Papa Parse, `csv-stringify` and `ical-generator` for commodity file formats.
4. MSW and Playwright, with selected `@axe-core/playwright` checks, for reusable behavioral evidence.
5. `nestjs-pino` for consistent HTTP log context; retain existing Pino/Sentry/Prometheus tools.

Use existing ESLint, Zustand persistence, TanStack Query options and pnpm catalogs more consistently.
Evaluate pg-boss for generic durable job machinery only after a compatibility proof. Consider dnd kit
for calendar interaction and i18next for localization when touching those workflows. Do not add all
these dependencies in one batch.

## Scope, evidence and limitations

The audit inventories manifests, source structure and call sites across admin-web, API, worker,
contracts, domain, DB and the vanilla kiosk. It follows representative implementations for forms,
HTTP, navigation, persistence, calendars, authentication, imports/exports, queues, transactions,
authorization and observability. It is a broad static architecture review, not a line-by-line review
of every function or a runtime correctness certification.

Initial HEAD was `5689729`. Another session's routing changes were present and were committed during
the audit as `c3b38f2eab9b67208ed5da444f38264510cf03aa`. Final source references use that state. The routing
commit is another session's work. No application code or dependencies were changed by this audit.
Production deployment of that revision was not verified for the source analysis.

Simple file inventory, excluding filenames containing `.test.` or `.spec.`:

| Surface     | Source files | Source lines | Test files |
| ----------- | -----------: | -----------: | ---------: |
| Admin web   |          296 |       41,242 |         70 |
| API         |          154 |       30,602 |         45 |
| Worker      |           23 |        3,771 |         14 |
| Pure domain |           56 |        4,821 |         31 |
| Contracts   |           32 |        4,189 |          5 |

Counts include preview fixtures and other non-test source files. They measure size, not complexity,
coverage or removable code. Static substring searches found `usePersistentState` in 21 frontend files,
`useMutation` in 31, `validateWith` in 6 and `isUnchanged` in 5; these include definitions. The custom
API validation pipe has 126 controller usages. These are inspection signals, not defects by count.

The earlier [quality audit](../2026-09-12/code-quality-review.md) and
[simplification review](../2026-09-13/code-simplification-review.md) were discovery inputs. Findings
below were checked against source again; old deployment/test claims were not reused as fresh evidence.
Official sources were consulted during this audit. No download-count ranking, market-share study,
bundle benchmark, exhaustive license/security audit or migration prototype was performed. A library
with documented capabilities is a candidate, not proof of compatibility with every installed version.

## Existing foundation: retain and complete

| Concern               | Actual implementation                                           | Decision                                                                    |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Client workflow state | Zustand 5; generic UI bag and typed feature stores              | Keep; distinguish form, URL, workflow and persisted state                   |
| Remote state          | TanStack Query 5; shared client and key factory                 | Keep; standardize query options, cancellation and invalidation              |
| Routing               | TanStack Router with hash history at `app/router/router.ts`     | Already adopted in inspected source; do not propose another router          |
| Tables                | TanStack Table **9.2.4**, used by `shared/lib/table-model.ts`   | Already implemented; do not copy v8 examples or add another grid by default |
| Validation            | Shared Zod 4 contracts                                          | Keep as authoritative runtime contract source                               |
| Forms                 | Manual values, errors, attempted flags, baseline comparisons    | Pilot a dedicated form library                                              |
| UI primitives         | Radix/shadcn, Tailwind, shared reading/loading surfaces         | Consolidate usage; do not replace with a second component system            |
| Images                | Annotorious, Panzoom, sharp, S3 SDK                             | Already delegated to libraries; preserve adapters and evidence identity     |
| API/auth/data         | Nest 11/Fastify, Better Auth, Drizzle/PostgreSQL                | Retain                                                                      |
| Jobs                  | Canonical PostgreSQL durable tasks plus legacy BullMQ consumers | Assess actual guarantees before selecting one execution library             |
| Telemetry             | Pino, Sentry, prom-client; Sentry traces disabled               | Standardize context before adding infrastructure                            |
| Tests                 | Vitest, Testing Library, fast-check, Testcontainers             | Keep; add browser/network evidence where missing                            |

Manifest ranges are not installed versions. For example API declares Nest `^11.1.0`, while the local
installed common package inspected for compatibility is 11.2.3. TanStack Virtual is neither declared
in the panel manifest nor imported in inspected frontend source; standards mentioning it do not prove
it is already used.

## Priority matrix

S = bounded adapter/configuration change; M = feature pilot and several integration points;
L = cross-feature or durable-state migration. These are relative estimates, not delivery promises.

| ID  | Decision                                                    | Priority           | Effort / migration risk                         |
| --- | ----------------------------------------------------------- | ------------------ | ----------------------------------------------- |
| A1  | Runtime-validated REST contracts, OpenAPI, generated client | High               | M pilot, L rollout; medium                      |
| A2  | TanStack Form + Zod for substantial forms                   | High               | M pilot; medium                                 |
| A3  | Typed persistence and explicit state ownership              | High               | M per slice; high for session/draft recovery    |
| A4  | Enforce architecture boundaries using tooling               | High               | S baseline, M cleanup; low with scoped adoption |
| A5  | Papa Parse + csv-stringify                                  | High               | S–M; medium at import/export boundaries         |
| A6  | ical-generator and supported SheetJS distribution           | Medium             | S each; medium compatibility risk               |
| A7  | MSW + Playwright and selected accessibility checks          | High               | M; test-only runtime impact                     |
| A8  | Pino request context and explicit correlation               | Medium             | M; medium data-redaction risk                   |
| A9  | Durable inbox/outbox and idempotency standards              | High               | L; high correctness risk                        |
| A10 | pg-boss evaluation for generic task execution               | Evaluate after A9  | M proof, L migration; high                      |
| A11 | dnd kit for calendar drag/drop                              | Medium             | M pilot; medium interaction risk                |
| A12 | i18next/react-i18next behind existing catalogs              | Conditional        | M–L; medium                                     |
| A13 | Date/time and query conventions using existing tools        | High for contracts | M incremental; high if time meaning changes     |
| A14 | pnpm catalogs and narrowly configured Knip                  | Medium             | S–M; low when not auto-deleting                 |

## A1. One REST contract pipeline

**Evidence.** `apps/admin-web/src/api.ts:26` accepts an arbitrary generic and returns `body as T`
at line 45. That does not validate HTTP data. The same module repeats URLs, methods and response
types across endpoint wrappers. Newer code already demonstrates a stronger pattern:
`features/employee-profile/model/api.ts:13` parses `EmployeeProfileView`, and
`features/schedule-management/api/schedule-api.ts:23` parses responses and checks command ownership.
The API's `common/zod.pipe.ts:5` is handwritten request validation; `main.ts` does not initialize
OpenAPI. The gap is consistency across an existing schema foundation.

**Recommendation.** Keep `packages/contracts` as the source of truth. Pilot `nestjs-zod` DTO/response
integration with `@nestjs/swagger`; derive an OpenAPI document and use Orval to generate fetch
functions/types. Feature-owned API modules expose deliberate public operations. Keep domain mapping,
permissions, cache invalidation and command-response identity checks handwritten and explicit.
Prefer generated transport functions with existing query options first, rather than replacing every
query hook and cache key simultaneously. Generated code belongs in an explicitly owned transport
segment, not copied into UI components or imported through feature internals.

Type generation is not runtime response validation. Preserve Zod parsing at the client boundary and
decide serializer behavior deliberately: stripping response fields without compatibility tests is
a contract change. Preserve cookie credentials, locale headers, multipart uploads, no-content replies,
non-JSON failures, abort signals, error codes and rolling-deployment fallback semantics.

**Alternatives.** A schema-aware fetch adapter alone is the smallest initial improvement. OpenAPI
client generation becomes valuable across the many endpoints. Do not introduce tRPC/GraphQL or
class-validator alongside Zod without a separate transport requirement.

**Compatibility gate.** Current online Nest docs include native Standard Schema integration that is
not exposed by the inspected installed 11.2.3 route parameter declarations. Do not copy that API into
this version. Verify `nestjs-zod`, Nest, Swagger and Zod versions in the pilot. Validate schema
refinements, input/output transforms, unions, nullable fields and dates through the generated spec.

**Acceptance.** One representative CRUD resource plus pagination works end to end; a malformed
response fails visibly; error codes and uploads retain behavior; generated output is reproducible;
query keys and invalidation remain compatible. Remove the corresponding manual wrapper duplication.

Sources: [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod),
[Nest OpenAPI](https://docs.nestjs.com/openapi/introduction),
[Orval fetch client](https://orval.dev/docs/guides/fetch-client/),
[Orval output configuration](https://orval.dev/docs/reference/configuration/output/).

## A2. Give form state a dedicated owner

**Evidence.** `features/employee-profile/ui/section-editor.tsx:32` manually owns draft, baseline,
version and attempted state. `lib/validation.ts:38` maps Zod issues to first-level field errors;
`lib/forms.ts:6` implements generic equality through serialization. `admin/EmployeesTab.tsx` contains
another large manually wired form. These responsibilities recur even in new feature code.

**Recommendation.** Pilot TanStack Form for field values, touched/error state, arrays and submission
coordination, using existing Zod contracts and shared field components. Query owns server records and
mutations; the form owns its editable draft; Zustand owns cross-page workflows and explicitly durable
draft recovery. Do not mirror the live form into Zustand on every change. Business normalization and
the command builder stay pure feature functions.

TanStack Form is the preferred candidate for this codebase, not a claim that it is the universal market
winner. React Hook Form is a credible alternative, but its subscription APIs require particular care
with React Compiler. Test whichever candidate is selected under the actual compiler configuration.
Do not adopt two competing form standards.

**Critical semantic detail.** TanStack Form's `isDirty` remains true after a value is changed and
reverted. Vakhta requires Save to disable again on reversion. Use `isDefaultValue` where appropriate
and compare normalized commands when whitespace/null normalization changes meaning. Do not replace
`sectionChanged` with `isDirty`. Schema validation also does not mean transformed output has become
the submitted command: explicitly parse/build the command at submission.

**Acceptance.** Pilot one ordinary form before the version-sensitive profile editor. Verify reset,
edit-and-revert, nested field errors, server rejection, preserved draft, latest-server conflict,
pending double-submit prevention and keyboard submission. Third-party internal hooks are distinct
from the repository's application-owned hook prohibition; no wrapper may hide our own forbidden hook.

Sources: [TanStack Form concepts](https://tanstack.com/form/latest/docs/framework/react/guides/basic-concepts),
[validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation),
[React Compiler incompatible-library guidance](https://react.dev/reference/eslint-plugin-react-hooks/lints/incompatible-library).

## A3. Typed state and persistence, using Zustand already installed

**Evidence.** `lib/ui-store.ts:14` stores `Record<string, unknown>` and casts values back to arbitrary
types at lines 37 and 49. Its persistence configuration at line 27 has no application schema migration
or runtime validation. Twenty-one inspected files mention this generic persistent state mechanism.
In contrast, Schedule's `model/store.ts:108` already validates stored drafts and reports recovery errors.
The generic store is a custom state framework built on top of Zustand rather than a typed feature model.

**Target ownership.**

| State                                                         | Owner                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Records, request status, cached views                         | TanStack Query                                             |
| Shareable filters, sort/page and deep-link target             | Validated TanStack Router search/path state                |
| Current field values and field errors                         | Form instance                                              |
| Cross-screen selection, workflow and pending command identity | Typed feature Zustand store                                |
| Truly local display state                                     | React local state                                          |
| Durable preferences/recovery snapshots                        | Explicit allowlisted persistence with schema/version/owner |

Adopt this incrementally after the routing change settles. Not every filter must be shareable, but
each needs one authoritative owner. Define actor/scope binding, storage version, invalid-data recovery,
retention, logout cleanup and multi-tab behavior. A second persistence or state library is unnecessary.

`auth/useSession.ts:21` prefers cached data when present, and `signOut` clears Query but does not invoke
the generic persistence cleanup. This is source evidence of incomplete session ownership, not a fresh
production security reproduction. Cover explicit 401 versus offline cached reads and actor changes
before migrating drafts; no library clears all application-owned storage automatically.

Source: [Zustand persist](https://zustand.docs.pmnd.rs/reference/middlewares/persist).

## A4. Turn architecture requirements into enforceable rules

**Evidence.** `eslint.config.js` enables TypeScript and React rules, but has no FSD dependency/public-API
checks and no explicit prohibition of the four project-restricted hooks. Source is a hybrid of
`app/pages/features/entities/shared` and legacy `admin`, `operations`, `components/app`, root `api.ts`
and `lib`. For example `shared/ui/resource-calendar/resource-calendar.tsx:15` depends on legacy
`components/app/data-table`; feature API modules import the root API module.

This is migration debt, not proof that every legacy import violates a completed FSD design. Move
coherent responsibilities: domain-free controls/transport to shared segments; feature commands,
contracts-to-view mapping and workflow state to the owning slice; composition to pages/app. A generic
root API module or forwarding class should not become the permanent owner of all business operations.

**Recommendation.** Start with scoped ESLint restricted-import rules for stable migrated boundaries,
plus explicit application-owned hook restrictions. Pilot Steiger as a report-only FSD check; it is
currently beta, so pin/configure it and do not let generic rules override accepted repository decisions.
Enforce new violations first with narrowly documented legacy exceptions. Do not install several
overlapping architecture linters or move files solely to silence a report.

**Acceptance.** A fixture with a forbidden dependency/public API deep import fails the check; valid
slice imports pass; legacy exceptions are named; the selected changed slice no longer routes its
domain responsibilities through a catch-all module.

Sources: [ESLint restricted imports](https://eslint.org/docs/latest/rules/no-restricted-imports),
[Steiger](https://github.com/feature-sliced/steiger).

## A5. Replace manual CSV protocol code

**Evidence.** `lib/csv.ts:5` implements a character-by-character parser, guesses delimiter from raw
first-line punctuation and silently reaches EOF while still quoted. `employeesFromCsv` separately
copies contract length checks. API `reports/losses.service.ts:365` and `bonus/bonus.service.ts:1970`
implement their own escaping. CSV formatting of text does not itself neutralize spreadsheet formulas.

**Recommendation.** Papa Parse for browser parsing; `csv-stringify` for Node serialization. Keep the
employee-column mapping and localized import flow. Use shared Zod employee contracts. Disable dynamic
typing for personnel numbers so leading zeros survive. Define headers, blank rows, delimiter, BOM,
line endings, file/row limits and visible parse errors explicitly. Preserve selected-file ownership
when async parsing completes; using a library does not by itself resolve competing file reads.

Use formula escaping for untrusted textual export cells while retaining typed numeric values. Protect
import compatibility rather than blindly inheriting new defaults. Test quoted separators, BOM, CRLF,
multiline text, missing quotes, leading-zero identifiers, empty data and formula-like cell text.

Sources: [Papa Parse](https://www.papaparse.com/docs),
[csv-stringify formula escaping](https://csv.js.org/stringify/options/escape_formulas/).

## A6. File serialization and dependency distribution

**iCalendar.** `apps/api/src/scheduling/feed.service.ts:156` builds VCALENDAR/VEVENT strings; lines
190–216 implement timestamp conversion, escaping and byte-aware line folding. Replace only this
serialization with `ical-generator`. Preserve UID, SEQUENCE, publication timestamps, UTC instants,
refresh metadata, revoked-token behavior and employee scope. Validate emitted events with a parser
and existing feed tests; a changed byte layout is acceptable only when consumers retain semantics.
[ical-generator](https://github.com/sebbo2002/ical-generator).

**XLSX.** Existing exporters already use SheetJS; API manifest/lock use `xlsx@0.18.5`. Official SheetJS
documentation identifies the npm distribution as outdated and describes supported tarball sourcing.
First fix update/source policy with an exact integrity-locked dependency and export fixtures. Do not
equate the npm version with the currently maintained upstream release. Consider ExcelJS only when
verified streaming/style requirements justify a migration. No exploit exposure was assessed here.
[SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## A7. Reusable network and browser verification

**Evidence.** Tests such as `operations/OperationsPage.test.tsx:107`, `admin/AdminPage.test.tsx:37`
and `features/employee-profile/ui/profile.test.tsx:23` replace global fetch directly. The repo has a
custom `preview.tsx` and preview fixtures. Inspected workspace manifests/configuration do not declare
Playwright, MSW, Storybook or axe; the API e2e file is not a browser journey suite.

**Recommendation.** Add MSW handlers shared between component tests and selected preview fixtures;
assert unhandled requests rather than returning permissive default successes. Add a small Playwright
suite for cross-page navigation, edit/revert/save, server errors, mobile reading surfaces and relevant
session recovery. Use existing preview fixtures for deterministic screenshots before deciding whether
Storybook would reduce maintenance. Storybook is optional, not a prerequisite for browser coverage.

Use axe on selected surfaces plus real keyboard/focus checks; an automated scan is not a complete
accessibility certification. Avoid screenshotting every trivial component or duplicating domain tests
in the browser. API response validation and shared fixture schemas keep mocks from drifting.

Sources: [MSW](https://mswjs.io/docs/),
[Playwright assertions](https://playwright.dev/docs/test-assertions),
[Playwright accessibility](https://playwright.dev/docs/accessibility-testing).

## A8. One logging context, not another telemetry platform

**Evidence.** API `logger.ts:5`, bootstrap `main.ts:25` and Telegram service logging have separate
setup paths. `events/event-store.ts:67` and `events/audit-log.ts:32` default correlation fields to null;
the inspected production call sites did not supply traceId. Sentry is already wired but traces are
explicitly disabled in API and worker observability configuration.

**Recommendation.** Use `nestjs-pino` for API request context and Nest integration. Share field names
and redaction between API and worker; carry request/correlation, command, source-event and job identity
across durable boundaries explicitly. AsyncLocalStorage does not cross processes or persisted jobs.
Keep credentials, presigned URLs and medical content excluded. Avoid putting arbitrary request data
into logs. Retain prom-client and Sentry; evaluate sampled tracing only against an actual diagnostic
need and cost budget. Do not confuse an application traceId with a verified distributed tracing span.

**Acceptance.** A controlled command can be followed from request to task and outcome; redaction tests
pass; trace/correlation propagation survives worker execution; instrumentation does not change audit
immutability or publish private payloads.
[nestjs-pino](https://github.com/iamolegga/nestjs-pino).

## A9. Standardize idempotency, inbox and outbox guarantees

**Evidence.** Shift transactions, communications actor/request locks and request replay storage use
different implementations. See API `shift/shift.service.ts:513`,
`communications/communications.service.ts:122`, and `requests/requests.service.ts:207`.
Telegram `update-dedup.ts:14` records a claim before downstream bot handling (`bot.factory.ts:250`).
Worker `outbox/relay.ts:109` starts a transaction and locks a batch; `sender.send` occurs at line 190
before completion is committed.

The outbox ordering means slow network calls hold DB resources. A crash after Telegram acceptance and
before commit can result in a later resend. The inbox ordering likewise needs a recovery contract for
failure after admission. These are source-derived failure scenarios, not observed production events.

**Recommendation.** Adopt explicit state contracts: durable admission, claimed processing, completed,
retryable failure and terminal failure. Define idempotency key scope, actor binding, payload fingerprint,
conflicting reuse, retention and replay response. Reuse narrow helpers where semantics truly match.
Business writes, events, task intent and replay results must remain in the appropriate transaction.
A generic request middleware cannot replace this boundary.

For external delivery, aim for short claim transaction → external call → owned completion/retry,
with expiry/fencing and deliberate duplicate handling. Preserve recipient and deadline revalidation;
moving a lock is not sufficient. Telegram acceptance, message delivery and human acknowledgement remain
different facts. Keep grammY and the notification domain model.

**Acceptance.** Fault tests cover rollback, duplicate/concurrent requests, changed payload under the
same key, worker death, stale claim, late deadline and network ambiguity. High-risk migrations need
the project's independent review. See existing [background-effect guarantees](../../engineering/features/background-effects.md)
and [timer recovery](../../engineering/features/timer-recovery.md) before changing ownership.

## A10. Evaluate pg-boss; do not blindly replace durable jobs

**Evidence.** Worker `main.ts:143` identifies canonical PostgreSQL admission and legacy BullMQ reads.
`packages/db/src/background-tasks.ts:52` implements atomic enqueue/conflict detection; line 132 claims
jobs with locks/leases; line 192 executes effects and completion atomically; later helpers renew/retry.
Several media/timer/photo/bonus runners implement polling and lifecycle. Ten inspected task/runner/
recovery files total 1,377 lines, including domain recovery rules; that is not a deletion estimate.

**Candidate.** pg-boss is closer to the current transactional PostgreSQL design than restoring a
Redis-only job source. Its current documentation includes Drizzle/postgres-js transaction adapters,
deferred work, retries and worker management. That establishes a plausible comparison, not proven
equivalence to Vakhta's immutable intents and wall-clock lease fencing.

**Required proof.** Compare atomic admission and completion, payload-conflict behavior, expired-owner
rejection, restart recovery, job retention, immutable original deadline, old payload versions and
safe replay. Keep domain source-event identity and audited recovery. Account for the library's schema,
migrations, polling and operational ownership. A library may replace generic scheduling/claiming code
while application-specific history remains separate. Do not run two authoritative consumers without
fencing. Retire legacy BullMQ only after verified drain and rollback readiness.

If these guarantees still require most of the custom engine, keep the engine and unify its runner
adapters instead. Neither pg-boss nor BullMQ makes PostgreSQL and Telegram an atomic system; do not
promise end-to-end exactly-once delivery. Temporal is not justified by the inspected requirements.

Sources: [pg-boss transaction adapters](https://pgboss.io/api/adapters),
[worker API](https://pgboss.io/api/workers),
[job API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md).

## A11. Calendar interaction: replace mechanisms selectively

**Evidence.** `shared/ui/resource-calendar/resource-calendar.tsx:226` handles native drag-over/drop;
line 276 marks cards draggable. The shared calendar also implements custom paging, selection, cards
and detail-panel composition. The operational calendar model contains legitimate product rules.

**Recommendation.** Pilot dnd kit for pointer/touch/keyboard sensors and drag interaction while keeping
the prepared calendar model and named move command. Current docs distinguish newer packages from the
legacy `@dnd-kit/core` ecosystem; choose and pin a compatible API family after a compiler/mobile pilot.
Preserve the explicit move alternative, scroll behavior, focus, readonly guards and deterministic
ordering. Do not assume installing a sensor makes the whole calendar accessible.

Do not replace the entire calendar with FullCalendar by default. Its resource/timeline capabilities
are Premium, and Vakhta's staffing, evidence and publication workflow still needs custom models. A
commercial calendar comparison becomes worthwhile if resource timelines, resize or virtualization
become requirements with demonstrated maintenance cost. Virtualization should follow measurement:
the current shared calendar already pages resources and limits visible card previews.

Sources: [dnd kit sensors](https://dndkit.com/extend/sensors/),
[FullCalendar Premium](https://fullcalendar.io/docs/premium).

## A12. Localization: a real replacement candidate, lower urgency

**Evidence.** `packages/i18n/src/index.ts:40` implements placeholder substitution with a regex and
eager catalog lookup. `apps/admin-web/src/i18n.tsx:22` changes language through a full page reload.
Typed catalogs and three-language completeness tests already provide useful guarantees.

**Recommendation.** i18next plus react-i18next becomes worthwhile for standard plural forms, namespace
loading and reactive language changes without reloading unsaved work. Pilot behind the existing
package boundary and retain key/type checking. Backend/bot code needs a locale-explicit instance;
never switch a process-global language per concurrent request. Test Ukrainian/Russian plural cases,
fallbacks and placeholder escaping separately for HTML versus plain Telegram text.

Do not migrate thousands of strings just to replace a small formatter. If pluralization, translator
workflow and reload behavior are not active problems, retain the current catalogs until that feature
is changed. No evidence here requires a hosted translation platform.

Sources: [i18next plurals](https://www.i18next.com/translation-function/plurals),
[TypeScript integration](https://www.i18next.com/overview/typescript).

## A13. Standards that need no new framework

**Dates and time.** Domain `time/plan.ts` already uses Luxon with site timezone and DST-aware shifts.
Frontend mixes Intl, Date, date-fns, Schedule UTC business-date helpers and browser-local DayPicker
adapters. This is not automatically duplication: a calendar date and a timestamp are different data.
Define `BusinessDate`, `YearMonth`, `Instant` and IANA timezone semantics at contracts; distinguish
site-local operational time from viewer-local display explicitly. Validate calendar dates at
boundaries. Keep Date adapters at widget boundaries and reuse Luxon for zoned domain operations.
Do not change 11/13-hour DST shifts to fixed milliseconds or add Day.js/Moment/a Temporal polyfill
merely to standardize names. Test DST, midnight, month edges and a viewer outside the site timezone.

**Query conventions.** `lib/query.ts` already supplies a QueryClient and keys. Move toward feature-owned
`queryOptions` factories reused by screens and route prefetching; retain one cache and stable key
identities. Pass cancellation signals through transport, document staleness by resource and use
explicit invalidation after commands. Treat uncertain mutation outcomes through command identity,
not automatic retry. Avoid a generic `useCrud` layer that hides resource-specific behavior.
[TanStack Query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options).

**SSE.** `lib/live.ts:13` already centralizes EventSource invalidation. Native EventSource plus Query is
a reasonable foundation. Give subscriptions an explicit owner and cleanup policy consistent with
the hook rule, batch invalidations if measured necessary, and preserve reconnect/offline feedback.
Do not add Socket.IO or another synchronization store for one-way invalidation alone.

**Access.** Keep Better Auth for identity/session and domain scope policies for authorization.
`packages/domain/src/access/scope.ts` and API `common/access-scope.ts` express grants and SQL scoping.
Standardize policy declarations and scope tests before considering CASL/Oso/Casbin; a second policy
engine would need to preserve DB filtering, not merely hide buttons.

**Domain and services.** Keep pure shift FSM, scheduling eligibility, bonus rules, Drizzle and SQL
invariants. Extract cohesive command handlers and read projections from large services where needed.
No evidence supports replacing these with XState, Prisma/TypeORM, generic repositories, a mandatory
CQRS/event-sourcing framework or microservices. Custom business rules are the product; commodity
parsers and job mechanics are the replacement candidates.

## A14. Dependency and dead-code governance

Manifests repeat ranges across workspaces (Zod, grammY, Vitest and tooling); `pnpm-workspace.yaml`
has no catalog. Add catalogs for deliberately shared versions using the existing pnpm 10 capability.
Do not force every package onto the newest major. The installed pnpm is 10.9.0, so do not use
`catalogMode`, which the documentation marks as added in 10.12.1, without a separate upgrade.
[pnpm 10 catalogs](https://pnpm.io/10.x/catalogs).

Configure Knip with actual application, preview, CLI, test and migration entrypoints. Treat unused
reports as investigation candidates; recovery consumers and dynamically referenced files must not be
removed automatically. Do not add Nx or replace Turborepo to obtain these checks.
[Knip entrypoints](https://knip.dev/explanations/entry-files).

## Adoption plan and success criteria

1. **Bounded replacements:** CSV import/export, iCalendar adapter, supported XLSX source policy and
   dependency catalogs. Deliver each coherent concern with protocol fixtures and compatibility checks.
2. **Representative vertical pilots:** one form and one REST resource through Zod → Nest/OpenAPI →
   client → Query → UI. Compare authored code and error behavior before/after, not package count.
3. **Enforce the selected pattern:** scoped architecture checks, MSW fixtures, critical Playwright
   journeys, typed stores and validated route search on touched slices. Retire superseded paths.
4. **Reliability standard:** specify and test command/inbox/outbox failure semantics; introduce log
   correlation. This is high priority regardless of whether a queue library migration happens.
5. **Costlier migrations:** compare pg-boss against the tested guarantees; pilot calendar interaction
   and localization only with a concrete product need. Reject pilots that retain equivalent custom
   machinery while adding operational or dependency burden.

Measure hand-authored transport/form/protocol code removed, duplicated rules retired, endpoints with
runtime-validated contracts, correctly restored/rejected drafts, incident traceability and the number
of supported execution paths. No percentage savings or performance improvement is claimed in advance.

For any pilot, success requires acceptance behavior and relevant regression evidence, a smaller clear
ownership boundary, no weakening of permissions/history/recovery, supported pinned dependencies and a
rollback route. Recheck the official API and license for the selected exact version before adoption.

## Verification for this audit

Performed source/manifest searches, representative call-chain reads, file counts, review of accepted
engineering decisions and primary-source research. The only task-owned change is this document;
formatting and local link targets are checked during delivery. No dependency installation, application
test suite, browser journey, production action or queue compatibility prototype was run for the audit.
Recommendations above remain proposed; they are not implemented fixes or certified migrations.
