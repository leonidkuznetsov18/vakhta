# Implementation Plan: Architecture standardization

**Change**: 009-architecture-standardization | **Date**: 2026-09-15 | **Spec**: [spec.md](spec.md)
**Baseline**: be779fc | **Checkout**: master | **Writer/index owner**: root Codex
**Evidence**: [Development workflow](../../docs/engineering/features/development-workflow.md)

## Summary and Technical Context

Deliver the audit in independently verified increments. First replace commodity file-format code,
make file reads explicitly owned and standardize shared dependency declarations. Keep business queries,
transactions, permissions and user workflow intact. Later pilots retain their conditional status.

Installed foundation: React 19/Compiler, Query 5, Zustand 5, Router 1, Nest 11/Fastify, Zod 4,
Drizzle/PostgreSQL, pnpm 10.9.0 and Node 22. Verified candidates: Papa Parse 5.7.0/types 5.5.2,
csv-stringify 6.8.3, ical-generator 11.1.1 (Node 22 or >=24), SheetJS official 0.20.3 tarball.
Use exact new dependency versions and preserve unrelated resolutions.

Compatibility finding: SheetJS 0.20.3 rejects the existing bonus worksheet name `history`, reserved
by Excel. Rename only that worksheet to `Bonus history`, verify its text/numeric cells by reading the
generated workbook, and document the downloadable-file change. This is required to keep export working.

## Constitution Check

Pass: owner authorized spec/plan/start; current master and one writer; no DB/domain policy change;
shared validation; FSD import slice; no application-owned prohibited hooks; three-language feedback;
explicit stale-read ownership; focused integration evidence and one export reviewer. Legacy shared
controls under components/app remain reused according to the incremental architecture rule.
Spec Kit extension hooks are absent. No extra model/contract documents are needed: existing contracts
and the audit provide them. No automatic branch or worktree helper is invoked.

## DESIGN: First-delivery ownership

### Employee import

- Move the coherent dialog into `features/employee-import/ui/import-dialog.tsx`; expose only the
  component from `features/employee-import/index.ts`. EmployeesTab imports that public API.
- `model/preview.ts` owns Papa Parse configuration, recognized header aliases, resource constants,
  employee-schema validation and prepared valid/invalid rows. This is employee-specific, not shared.
  Use `ImportEmployeesCommand.shape.items.element` and validate the final command. Dynamic typing is
  disabled. Trim through contract rules. Preserve optional header and ignored extra columns.
- `model/file-selection.ts` owns a per-dialog vanilla Zustand store with a discriminated read state
  and monotonic read identity. `select(file)` immediately discards old preview, reads asynchronously,
  catches failures and applies results only for the latest identity. `reset()` invalidates reads.
  File.text has no cancellation API; fencing owns stale results explicitly. No persisted file data.
- Query owns the import mutation (retry disabled). Pass an immutable validated command as its variables.
  Disable file changes/dismissal while saving and guard handlers, so completion cannot land in a new
  import session. Closing/unmount cleanup invalidates reads. Preserve API errors and valid preview for
  explicit retry. Successful completion clears preview and retains the created/skipped report.
- Reuse DataTable, Alert/Feedback, LoadingState, Dialog and localized text. Introduce localized read,
  malformed/oversize/row-limit/empty messages in all catalogs. Preserve table pagination and count.
  A bounded body scroll region keeps controls reachable on mobile and long reports readable.
  The opener passes its clicked element for close-focus restoration; do not duplicate that state
  in a separate boolean. A disconnected opener is not focused after navigating away.

### CSV

`apps/api/src/common/csv.ts` is a domain-independent serializer used by losses, bonus history and
closed-period bonus exports. Use `csv-stringify/sync`: semicolon, LF, eof:false, caller BOM policy,
quoted_match for CR/LF and escape_formulas:true. Numeric cast returns field options disabling formula
escaping only for actual numbers; numeric-looking strings remain untrusted text. Preserve metadata
comment fields in the closed-period export through the same adapter so rule labels cannot break
CSV cells, then serialize the whole header/data matrix. No row/transaction
or audit changes. Remove the three handwritten escaping paths.

### iCalendar

`apps/api/src/scheduling/calendar-feed.ts` serializes a prepared assignment projection; FeedService
retains query and token ownership. Use ical-generator with explicit product ID object, Gregorian
scale, PUBLISH, Vakhta name and 10,800-second TTL. Explicitly bind UID, stamp/lastModified, sequence,
start/end and summary/description. Leave timezone unset for UTC. Append the current final CRLF.
Library-added standard NAME is acceptable; event identity/timing semantics must not change.

### Dependencies

Use the exact official SheetJS CDN tarball URL with lockfile integrity. This preserves current Docker
manifest-only dependency stages; vendoring would additionally require image build-context changes.
Centralize already-resolved shared ranges in pnpm catalog and use catalog: references for shared
dependencies, aligning only manifest ranges where the resolved version is already identical. Do not
use catalogMode (not available in pnpm 10.9.0). No package-manager/framework upgrade.

## Project Structure and Allowed Files

First delivery owns `specs/009-architecture-standardization/`, the new `features/employee-import/`
slice, deletion of `admin/ImportDialog.tsx` and `lib/csv.ts`, EmployeesTab's import, removal of the
old import API wrapper in `src/api.ts`, the shared import limit in contracts/identity.ts, API common CSV
adapter/tests, scheduling calendar adapter/tests and FeedService, losses and bonus serializer call
sites/tests, relevant package manifests, pnpm-workspace.yaml/lockfile, four i18n catalog/type files,
the preview.tsx import fixture, existing admin/reports product docs and development-workflow engineering memory. Test-only browser
artifacts live in ignored test-results. No other session's files/index entries are owned.

Subsequent allowed files are selected in T018 onward before that increment. This plan is not authority
to sweep unrelated files or simultaneously rewrite all state/transport paths.

## Lean Review

Proceed: keep select → preview → import → report. Reject broken files early and prevent a stale preview
from causing rework. No new worker step, dashboard, production data or manual approval ceremony.
Measure correctness via known fixtures and retry/read ownership; do not claim productivity savings.

## IMPLEMENT: Ordered Delivery

1. Write/validate spec, plan and tasks; establish exact dependency APIs and retained contracts.
2. Add focused regression fixtures, replace CSV protocols/import state, verify UI behavior.
3. Replace feed serializer and update SheetJS source; exercise existing export/feed integration tests.
4. Consolidate dependency declarations, run affected checks and review the fixed export diff.
5. Record desktop/mobile evidence, update docs, deliver one coherent first batch to master.
6. Next: form and REST contract pilots → ownership/testing/architecture → correlation/reliability →
   conditional queue/calendar/localization decisions. Record exact pilot resources before implementation.

## VERIFY and HARDEN

- AC-001–003: `pnpm --filter admin-web exec vitest run src/features/employee-import/model`.
- AC-004: employee-import UI test; relevant AdminPage test; local preview in real browser at desktop
  and 390px, including valid/malformed/empty/result states, keyboard and bounded scrolling.
  File-read rejection is injected in model/UI tests; the real file chooser covers actual local reads.
- AC-005: `pnpm --filter api exec vitest run src/common/csv.test.ts src/reports/losses.service.test.ts
src/bonus/bonus.service.test.ts`; preserve numeric/formula text distinction in a real export assertion.
- AC-006–008: calendar adapter unit tests; existing scheduling service tests for saved-version XLSX,
  retrospective and personal feeds. PostgreSQL Testcontainers fixture and current Docker runtime.
- AC-009–010: frozen-lock install, API/admin typecheck and changed-file ESLint/Prettier; API build and
  panel build for dependency/bundle compatibility. Compare installed direct versions before/after.
- One read-only independent review of export compatibility; reuse valid test results. Check complete
  import journey with fixtures; never manufacture production employee records. Report blocked deployed
  checks honestly. Full CI/release/announcement remain separate evidence from local tests.

## REPORT and Documentation

Update tasks after actual verification, add concise decisions/evidence to development-workflow memory,
and update existing product documents for import limits/errors and CSV text behavior. First delivery
can satisfy SC-001 while SC-002 and later tasks remain pending. No intermediate docs-only pushes.

## Open Decisions and Research

First-delivery requirements resolved. Future pilot selection and conditional migration gates remain
explicit ordered work, not required user input for this increment. Verify APIs against pinned source.

- [Papa Parse configuration/errors](https://www.papaparse.com/docs)
- [csv-stringify formula escaping](https://csv.js.org/stringify/options/escape_formulas/)
- [csv-stringify field casting](https://csv.js.org/stringify/options/cast/)
- [ical-generator 11.1.1](https://github.com/sebbo2002/ical-generator/tree/v11.1.1/src)
- [SheetJS official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
- [Excel reserved worksheet names](https://support.microsoft.com/en-us/excel/rename-a-worksheet)
- [pnpm 10 catalogs](https://pnpm.io/10.x/catalogs)

## DESIGN: Forms, contracts and HTTP transport (T018–T025)

Owner steering on 2026-09-15 explicitly prioritizes selecting a maintained HTTP client. Adopt exact
Axios 1.20.0 for panel API transport. npm's last-month endpoint (2026-08-13–2026-09-11) reports
454,819,837 Axios downloads, 100,704,707 ofetch, 26,684,400 Ky and 932,115 Wretch downloads.
These include transitive/automated downloads, not unique applications. Axios leads this comparison;
selection also depends on AbortSignal support, typed error discrimination and Orval's custom Axios
mutator integration. Ky/ofetch are credible smaller fetch-oriented alternatives, but introduce no
clear advantage for this application. Do not add another retry library: Query owns query retries;
mutations retain retry:false. Native fetch was previously retained as an existing thin adapter,
not selected by a comparative transport evaluation.

Transport ownership: `shared/api/{api-error,index}.ts` owns Axios, credentials, locale,
cancellation and normalized transport/domain failures. `shared/config/locale.ts` owns the existing
locale lookup extracted from legacy `i18n.tsx`; the latter re-exports it for compatibility. Root
`api.ts` keeps a narrow RequestInit compatibility function delegating to the shared client while
existing endpoint wrappers migrate by slice. Existing ApiError consumers retain status/code.
Axios's maintained fetch adapter uses standard Request objects and resolves current global fetch.
Adapt legacy preview/test fixtures through a test-only Request reader; keep production Request and
Response constructors intact so cookie credentials and multipart encoding remain browser-owned. Preserve FormData boundaries and no-body DELETE,
HTTP status/domain errors for JSON and non-JSON failures, empty responses, binary exports, and
AbortSignal cancellation. Malformed successful JSON is a response failure, never usable data.
Do not log Axios configuration or response objects. No automatic mutation retry or token refresh.
Migrate all four direct authenticated panel fetch callers (profile avatars, communication attachments,
schedule and retrospective exports); build-check's static HTML fetch and SSE remain separate protocols.
Focused tests cover actual transport behavior and existing affected feature suites. UI behavior is
unchanged by this transport substitution; pilot form changes below need separate visual evidence.

Form pilot: `features/employee-profile/{model/editor,ui/section-editor}.ts(x)` already has real
expectedVersion conflicts and explicit latest-version acknowledgement. TanStack Form owns draft,
field validation and submission; shared Zod contracts remain the rule source, Query owns requests.
Retain normalized edit/revert detection, pending guards, failed draft preservation and conflict
acknowledgement. Add meaningful reset behavior and compiler-enabled regressions in the existing
profile suite. Never replace conflict handling with unconditional overwrite.

Contract pilot: real `AdminEmployeesController` GET `/admin/employees/page` and POST
`/admin/employees/import`. Nest/Zod DTO metadata must derive OpenAPI from the actual controller;
preserve guards, scope restrictions, status codes and existing error envelopes. Generate transport
into an employee-owned FSD API segment, use the shared Axios mutator, and retain runtime Zod
response validation. Cover pagination, cancellation, malformed responses and import compatibility.
Document reproducible generation and drift checks; do not hand-maintain a second request schema.

Sources: [Axios configuration](https://axios-http.com/docs/req_config),
[Axios cancellation](https://axios-http.com/docs/cancellation),
[Orval custom Axios](https://orval.dev/docs/guides/custom-axios/),
[npm download counts API](https://github.com/npm/registry/blob/main/docs/download-counts.md).

### Executable contracts and test tooling

Use nestjs-zod 5.5.0 and Swagger 11.4.7 (compatible with Nest 11), OpenAPI 3.1, Orval 8.33.0
with axios-functions and the real shared API public entrypoint. `employee-dto.ts` derives four DTOs
from shared contracts. Only the two pilot methods use the maintained validation/serialization
integration. Retain legacy validation envelope and role/scope guards. The reflection-only exporter
under `apps/api/scripts/` imports built production controllers without starting DB/network services.
`entities/employee/api/directory.ts` validates generated responses and exposes the two operations;
remove the import feature's redundant transport and use the generated page operation in profile
lookup. Reject repeated pagination cursors, including cycles longer than one page.

T024 adds MSW 2.15.0 to exercise the real Axios adapter and generated operations with HTTP fixtures.
Playwright 1.63.0 + axe-core/playwright 4.13.0 cover the actual profile editor on desktop/mobile:
normalized no-op, invalid input, reset, failed save preservation, conflict acknowledgement and retry.
A dedicated fixture entry renders the real form/providers with non-production fixture data; no
employee mutation is performed against production. CI runs the Chromium journey and retains failure
artifacts. Generated contract drift is checked after the build. Test-only fetch fixture adapters
preserve existing legacy suites while new HTTP fixtures use MSW.

### Typed persistence pilot (T022)

Migrate AuditPage's three facet filters (action/object type/event type), which have no cross-feature
preset writers, into `features/audit-filters/model`. Zustand persist owns a versioned, Zod-validated
map keyed by authenticated actor UUID. The actor is supplied from the existing session query; no
server data or authentication authority is copied into the store. Unknown/unowned legacy `vakhta.ui`
values are not imported. Malformed JSON/schema, unsupported versions and unavailable storage fall
back to defaults/in-memory operation with a safe diagnostic. Version 0 of this actor-owned shape has
an explicit migration; unsupported future versions reset. Keep search/open-row legacy state outside
this bounded pilot and document that wider session/cache migration remains separate. Test actor
switching, reload, corruption, version migration and failed writes before using the new model.

### Architecture guardrails (T023)

Use maintained eslint-plugin-boundaries 7.2.0 with TypeScript alias resolution for the migrated
employee, audit-filter and transport slices. Enforce downward imports and public feature/entity
entrypoints; document existing root API/UI adapters as explicit transitional dependencies. Add
scoped restrictions against named/aliased/namespace React lifecycle hooks. Knip 6.35.1 and Steiger
0.6.0 are report-only repository assessments; explicitly include previews, scripts, workers, bot,
kiosk and migration entrypoints. Findings require human validation and never trigger auto-deletion.

## DESIGN: Operational contracts (T026–T029)

T026 uses nestjs-pino 4.6.1 (compatible with Nest 11/Pino 9), one Nest request logger and Fastify's
separate logger disabled. Validate/generate UUID request IDs. Request/response/error serializers use
allowlisted identifiers, method/status and error classification; never raw URL/query, headers,
cookies, payloads or upstream error messages. API task-admission logs carry the durable task UUID,
kind and `task_intent_staged` (not proof of commit). Worker outcome logs carry the same task UUID,
kind, attempt and completion/retry/lease-loss classification. No new distributed tracing claim.

T027 fixes demonstrated outbox batch-wide replay: each locked notification row commits independently,
so failure after a later Telegram send cannot roll back an earlier SENT receipt. Preserve SKIP LOCKED,
retry/429/skip behavior and reminder revalidation. Network I/O stays inside each row transaction in
this bounded change. Acceptance by Telegram followed by failed receipt persistence can still cause
one-row replay; explicitly test and document this external-system ambiguity.

Telegram admission remains at-most-once because handlers mix non-idempotent database/Redis/Telegram
effects. Persist safe PROCESSING/COMPLETED/FAILED outcomes in the existing result column; distinguish
handler failure from failure to record completion. Do not delete claims or automatically replay.
Interrupted PROCESSING is ambiguous, not completed. Outcome records are not a durable payload inbox;
automatic replay needs a separate per-handler recovery design. Tests inject database faults and
exercise middleware outcomes; independent review precedes delivery.

The existing transactional schedule command receipts (actor, canonical payload hash, authorization
recheck, effect/event/task/receipt transaction) become the command standard. Existing legacy domain
receipts remain an explicit migration inventory. Evaluate pg-boss against current fenced task leases
and immutable intent; retain unless it demonstrably removes equivalent machinery. Evaluate dnd kit,
i18next and virtualization against the inspected workflows, with explicit adoption triggers rather
than dependency installation without a measured requirement.

### Final conditional decisions and migration boundaries (T025, T028, T029)

- **pg-boss: retain current engine.** Existing immutable task intent, per-attempt fencing, database-clock
  expiry and effect/completion transaction are tested locally. Official pg-boss adapters support
  transactional Drizzle operations, but public job-ID completion/heartbeat APIs do not demonstrate
  equivalent per-attempt fencing. This is a source-based evaluation, not an executed pg-boss spike.
  Reconsider only with a fault-tested replacement proving stale-owner rejection and atomic effects
  while materially deleting custom machinery. Sources: [adapters](https://pgboss.io/api/adapters),
  [jobs](https://pgboss.io/api/jobs).
- **dnd kit: defer adoption.** Calendar native drag has an explicit Move editor serving keyboard/mobile
  workflows. A library migration needs a real touch/keyboard-drag requirement and a focused pilot
  preserving scroll, focus, permissions and read-only published history. Adding sensors now would
  duplicate the current editor without demonstrated benefit. [Keyboard sensors](https://dndkit.com/extend/sensors/keyboard-sensor/).
- **i18next: retain current catalogs.** Typed three-locale catalogs and explicit-locale formatting serve
  the current application. Reconsider for maintained plural rules, lazy namespaces or translator tools;
  preserve concurrent backend locale isolation rather than global changeLanguage. No translation
  runtime added solely for popularity. [Types](https://www.i18next.com/overview/typescript),
  [plurals](https://www.i18next.com/translation-function/plurals).
- **TanStack Virtual: defer.** Calendar currently pages 20 resources and previews three cards per cell.
  No measured unbounded-list bottleneck justifies a virtualizer. Reconsider after profiling a concrete
  workflow; preserve row focus, expansion geometry and full filtered counts.
- **Dates/query/SSE: retain existing tools, codify ownership.** Luxon/domain rules own timezone/DST,
  panel helpers own display, Query owns server state, EventSource signals invalidation. Add a reusable
  employee-directory queryOptions factory and cursor-cycle regression. The old live adapter remains
  documented hook/lifecycle migration debt; no duplicate event cache or new date framework.

Allowed files now also include the audit-filter slice, profile model/public API/EmployeesTab query
factory, shared transport/config, generated employee entity, API employee DTO/controller/exporter,
logger/timer producer, Telegram dedup, worker relay/timer consumer, scoped ESLint scripts, Knip config,
Playwright/MSW fixtures, dependency manifests/lock, CI checks, and canonical engineering evidence.
The shared transport implementation lives directly in `shared/api/index.ts`: Orval must inspect the
actual mutator signature to infer its cancellation options; no forwarding-only client barrel remains.
