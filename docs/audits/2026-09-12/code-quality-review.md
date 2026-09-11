# Backend and frontend code quality review

Date: 2026-09-12. Baseline: `8c1aae5d78c0505f1b3708454fb3ac1cd51b8094` (`master`).

## Scope and verdict

The owner requested a detailed backend/frontend review, unused-code cleanup and replacement of
unnecessary custom implementations with existing npm/GitHub solutions. This is a repository-wide
static/dependency audit with focused executable reproductions, not exhaustive certification of every
journey. Coverage includes API identity/support/Telegram boundaries, worker dependencies/recovery,
shared domain/contracts, panel session/routing/import/state/table/photo code and the vanilla kiosk.

The most consequential problems are request ownership, session isolation and duplicated temporal rules.
Removing unused declarations alone will not resolve them. Preserve the Nest modules, pure domain FSM,
transactional history, existing Query/Zustand ownership and incremental frontend FSD boundaries.

Five completely unreferenced functions were removed in this delivery (52 source lines, four files).
The behavioral findings below remain open. No domain behavior, dependency versions, database schema,
callback handler or product journey was changed. Findings distinguish executed reproductions from
static interleavings and maintainability recommendations.

Source paths and line numbers below refer to the baseline unless explicitly described as removed.
P1 means high priority; P2 means a concrete normal-priority defect; P3 means maintenance work.

## High-priority findings

### F1 — P1: kiosk responses can replace the selected terminal's QR

**Source:** `apps/qr-kiosk/src/main.ts:299-338`, terminal switch at `364-377`, timer at `385-390`.

The challenge request does not own a stable terminal identity, abort superseded work or reject stale
results. Select A, select B, resolve B, then resolve A: the selected URL remains `?terminal=b` while
the displayed terminal and QR become A. An employee can scan the wrong checkpoint's challenge.
When the countdown reaches zero, each timer tick launches another request while earlier work is pending.

**Executed evidence:** actual TypeScript source transpiled into jsdom, deferred HTTP responses and
mocked QR rendering produced `{selected:'?terminal=b', displayed:'A', qr:'qr_a'}`. Three expiry ticks
created three additional concurrent requests. This is a deterministic local reproduction, not a
production attendance event or physical scanner test.

**Smallest remedy:** one request owner, native AbortController, a captured terminal/generation checked
after asynchronous work, and rescheduling after completion. Retain vanilla Vite and `qrcode`; a React
migration or custom request framework would add no value. Acceptance: late A never replaces B,
including after QR rendering; no overlapping refreshes; cancellation is distinct from user-visible failure.

### F2 — P1: a rejected session can remain authenticated in the panel

**Source:** `apps/admin-web/src/auth/useSession.ts:18-23`.

The session projection prefers `query.data` without checking whether refetch failed with 401. TanStack
Query keeps previously successful data after a failed refetch. Consequently an explicitly rejected
session remains `authenticated`, with cached employee records and old role-based UI still available.
This does not demonstrate a server authorization bypass.

**Executed evidence:** the installed QueryObserver returned old user data together with `isError:true`
after a failed refetch. The source's branch then deterministically selects `authenticated`; the full
browser login/revocation journey was not run.

**Smallest remedy:** classify explicit authentication rejection before cached data, using the existing
ApiError/session model. Clear session-scoped records on rejection while preserving appropriate cached
data during transient network failures. Test success then 401 separately from success then offline/500.

### F3 — P1: sign-out does not complete client-session teardown

**Source:** `apps/admin-web/src/auth/useSession.ts:27-32`, `lib/ui-store.ts:64`,
`schedule/store.ts:22-37`, `features/incident-management/model/workspace.ts:38-43`.

Logout only calls `client.clear()`. The existing `clearPersistentState()` has test callers but no
production callers. The incident draft/lightbox cleanup subscription therefore does not receive its
reset, and the independent persisted schedule store has no logout reset or user namespace. A later
user of the same browser can inherit draft/selection state from the previous account.

**Executed evidence:** clearing the installed QueryClient removed its cache but the subscribed
QueryObserver still retained the old user result. Persistence/cleanup reachability was verified
statically. Cross-user browser behavior, including signed photo URL retention, needs a journey test.

**Smallest remedy:** one explicit session teardown using the existing Query and Zustand APIs, with
cancellation and deliberate user scoping/reset of drafts. Verify A logout, B login, delayed A response
and retained UI drafts. Do not delete `clearPersistentState` as dead code: its missing wiring is the defect.

### B1 — P1: concurrent position assignments can create overlapping active records

**Source:** `apps/api/src/identity/positions.service.ts:44-74`,
`packages/db/src/schema/identity.ts:36-54`.

Two assignment transactions can read the same current row, close it and each insert a new open row.
The update lock does not re-run the earlier SELECT. Two first-time assignments can also both observe
no current row. The schema and inspected migrations contain only a regular position lookup index,
with no uniqueness/exclusion invariant preventing overlap.

**Evidence:** verified static transaction interleaving and schema/migration inspection. A two-connection
PostgreSQL reproduction was not executed; no claim of existing corrupt production data is made.

**Smallest remedy:** reuse `apps/api/src/common/employee-lock.ts:7` before reading position history.
Check existing data before adding the appropriate PostgreSQL invariant. Test concurrent first
assignments and transfers against PostgreSQL, with one authoritative current record and preserved history.

## Further correctness findings

### B2 — P2: future transfers are selected as current positions

**Source:** `apps/api/src/identity/employees.service.ts:492,569`,
`apps/api/src/handover/handover.repository.ts:129`.

These queries check the upper validity bound but omit `validFrom <= now`, then prefer the latest start.
The assignment contract allows future dates. A transfer effective tomorrow can therefore change today's
employee card and the fallback checklist selection for an unplanned shift.

**Evidence:** source/contract verification. **Reuse:** the complete interval predicate already exists
in `apps/api/src/shift/shift.service.ts:1751-1752`. Share the backend temporal rule with an explicit time
argument. Before consolidating requests/bonus lookups, identify whether they need current or historical
time. Test immediately before, at and after the effective instant. No date library change is required.

### B3 — P2: a temporary Redis failure can turn an hourly quota into a permanent block

**Source:** `apps/api/src/infra/short-term-store.ts:20-23`; consumers include activation attempts
and support quotas.

INCR and the initial EXPIRE are separate awaited commands. Failure between them leaves a counter
without TTL. Subsequent increments exceed one, so none restores expiration.

**Executed evidence:** the current implementation with injected Redis failure produced
`{"counter":2,"expiryCalls":1,"retryRestoresExpiry":false}`. This used an in-memory driver double,
not a live Redis outage.

**Reuse:** the installed ioredis client and the atomic rate-limit pattern in the
[Redis INCR documentation](https://redis.io/docs/latest/commands/incr/). Keep first-request window
semantics explicit; do not reset TTL accidentally on every attempt. Add a real Redis atomicity/recovery
regression when fixing the boundary. No additional rate-limit framework is necessary.

### B4 — P2: voice support spends quota-controlled resources before admission

**Source:** `apps/api/src/support/support-bot.factory.ts:74-95`, `support.service.ts:66-71`;
voice HTTP calls in `support/voice.ts:38,49` and Telegram download at `support-bot.factory.ts:17`.

Voice download/transcription happens before `ask()` checks the hourly allowance. An authorized user
already over quota can repeatedly invoke paid transcription and only then receive the quota message.
The voice fetches also lack an application timeout/abort budget; downloaded bodies have no application
size bound, and the transcription response uses a type assertion instead of validation.

**Evidence:** verified call order and HTTP options; no paid API or stalled-network experiment.
**Smallest remedy:** shared admission before both text/voice processing, counted once; native request
cancellation/size limits and existing Zod boundary validation. Preserve the VoiceEngine port. Test that
quota exhaustion causes zero downloads/transcriptions and that timed-out calls terminate cleanly.

### F4 — P2: command palette navigation erases its selected sub-page

**Source:** `apps/admin-web/src/App.tsx:354-359`, `setActive` at `157`, `lib/route.ts:53-59`.

The callback writes `(section, sub)` then calls `setActive(section)`, which writes the section again
without its sub-path. Checklist, terminal and user destinations therefore fall back to the default
administration tab. The employee navigation repeats the same redundant write.

**Evidence:** static call-chain verification, not a browser reproduction. **Smallest remedy:** delete
the redundant second navigation and cover the App-to-route integration. The existing route helper is
sufficient; adopting a new router solely to fix this would be unnecessary.

### F5 — P2: custom CSV parsing silently drops valid employees

**Source:** `apps/admin-web/src/lib/csv.ts:7-9,14-38,49-57`.

Three local source-level reproductions:

| Input                                              | Actual result                                            | Required result              |
| -------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `0001;Табаченко Іван` followed by another employee | First worker omitted because `/таб/` matches the surname | Retain both workers          |
| `0001;"Іванов Іван`                                | Accepted as valid despite the unclosed quote             | Explicit parse error         |
| `0001,"Doe; Jane; Smith"` followed by comma CSV    | Wrong separator chosen by counting quoted semicolons     | Two correctly parsed columns |

**Best replacement:** [Papa Parse](https://www.papaparse.com/docs) for browser tokenization and
structured parse errors. Preserve identifiers as strings. Header recognition remains application
policy: match an exact supported header schema, never arbitrary substrings in employee data. Reuse
the existing employee Zod contract instead of maintaining a second copy of length constraints.
Preserve the existing preview/import UX; no new import subsystem is needed.

### F6 — P2: selecting a new CSV can import the previous file's rows

**Source:** `apps/admin-web/src/admin/ImportDialog.tsx:49-65`.

`pick()` displays the new filename while retaining old rows until `file.text()` resolves. Submit is
not guarded by a parsing state. A slow previous read can also overwrite a newer file selection.

**Evidence:** source-level async interleaving, not an executed UI race. **Smallest remedy:** give each
selection ownership, invalidate old parsed rows, model reading/error/ready states, and guard submission
until the selected file is ready. Implement together with F5 using the same existing preview surface.
Test A then B with reversed completion and an import click during B's read.

### B5 — P2: handwritten CSV exporters disagree and do not neutralize formula cells

**Source:** `apps/api/src/reports/losses.service.ts:160-163,365-368`,
`apps/api/src/bonus/bonus.service.ts:1321-1325,1970-1972`.

Three serializers independently escape delimiters/quotes. Bonus serializers omit carriage-return
handling that the losses serializer includes. None neutralizes user-controlled strings beginning with
spreadsheet formula prefixes. Quoting CSV syntax does not itself prevent formula interpretation when
the recipient opens the export in spreadsheet software.

**Evidence:** source inspection; spreadsheet application execution was not tested. **Best replacement:**
one export boundary using [csv-stringify](https://csv.js.org/stringify/options/escape_formulas/), preserving
semicolon/BOM/locale/column behavior and explicitly enabling `escape_formulas`. Treat numeric values
and text deliberately. Test names/comments with quotes, CR/LF, delimiters and formula prefixes.
Existing export result tests provide the starting point.

## Unused code and dependency inventory

### Removed in this delivery

| Removed declaration                             | File                                         | Evidence                                                              |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `isExclusionViolation` and its private constant | `apps/api/src/common/pg-errors.ts`           | No callers; other PostgreSQL helpers retained                         |
| `pendingHandoverScreen`                         | `apps/api/src/telegram/screens.ts`           | No imports/calls; only its unused type import also removed            |
| `reviewCategoryScreen`                          | `apps/api/src/telegram/screens.ts`           | No imports/calls; legacy callback handlers retained                   |
| `EmptyDescriptionText`                          | `apps/admin-web/src/components/app/page.tsx` | Unused forwarding component; real EmptyDescription remains            |
| `notifyError`                                   | `apps/admin-web/src/lib/toast.ts`            | Unused forwarding function; existing success/promise feedback remains |

These removals introduce no replacement implementation. No translations, persisted records, handlers
for previously sent Telegram keyboards, useful tests or public workspace domain exports were deleted.

### Remaining coherent cleanup candidates

- `shared/ui/calendar-period-field.tsx` has no frontend consumer. Its `createCalendarRangeDraft`
  machinery is reached only by this orphan or its tests. Remove the complete obsolete draft branch
  together; retain `orderedRange` and `unitDate`, which incident management actively uses. Reconcile
  documentation about the shared calendar before removal. Do not delete the whole calendar-range module.
- Zero-reference domain exports include `sumByState`, `medicalOnly`, `isEditableStatus`,
  `isRemarkComplete`, `ADMIN_ROLES`, `HR_ROLES`, `isEnterpriseScope`, `QR_DEFAULTS`.
  Review/remove their public barrel entries together and verify all workspace consumers; they were
  deliberately excluded from the small application-only deletion batch.
- API `bullmq` is unused; API timer admission now uses the PostgreSQL task abstraction. API `tsx`
  has no current package-script/source consumer. Worker direct `testcontainers` is unused because
  its fixture imports `@testcontainers/postgresql`. Remove with a pnpm-generated lockfile update
  and affected compilation/test checks. Worker `bullmq` remains actively used.
- `components/app/focus.ts` and `overview/attention.ts` are migration re-export shims. Update callers
  to the existing shared helper / feature public API when removing them. Their size alone is not a bug.

### False positives and intentional boundaries

Keep API/worker `pino-pretty` (runtime transport string), CLI entry points, DB seed/migration scripts,
manual `preview.html`/`preview.tsx`, Railway config and load-test entry points. Keep `lib/utils.ts`,
which the shadcn generator references in `components.json`. Keep `SYSTEM_ACTOR`, used by bootstrap CLI.
The release tests intentionally resolve plugins through semantic-release's own dependency context.

Unused exports are not equivalent to unused implementations: many functions are used within their
own file. Copied shadcn primitives are distinct from application policy. `InspectionEditor` owns an
annotation resource/lifecycle; a small IncidentsPage wrapper expresses a legitimate page boundary.
Worker legacy queue consumers are recovery compatibility, not automatic deletion candidates.

## Library and architecture recommendations

| Area                 | Decision                                                                      | Reason and required boundary                                                                        |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Unused-code analysis | Use Knip; an audit run used 6.35.1                                            | Native workspace analysis; configure runtime/manual entries and review findings before deletion     |
| Browser CSV          | Adopt Papa Parse in F5/F6                                                     | Replaces faulty tokenizer; retain app header/contract validation                                    |
| Backend CSV          | Adopt csv-stringify in B5                                                     | One tested serializer with BOM/delimiter/formula policy                                             |
| Redis quota          | Reuse ioredis + atomic Redis operation                                        | Existing dependency already provides the required transport                                         |
| Query cancellation   | Reuse TanStack Query signal support                                           | Connect existing request functions to the query's signal; a new HTTP client would not fix ownership |
| HTML-to-text         | Evaluate html-to-text for the small support converter                         | Replace regex tag stripping and manual entity decoding; retain expected guide paragraphs/tables     |
| Date/position rules  | Reuse the existing temporal predicate and Luxon/domain utilities              | New date packages cannot fix an omitted validity bound                                              |
| Photos               | Keep Annotorious and Panzoom                                                  | Already library-backed; custom annotation arbitration must be tested before any consolidation       |
| XLSX                 | Move away from obsolete npm xlsx distribution in a separate dependency change | Preserve export contracts; no blind major/library migration in a cleanup                            |

Registry checks on this date: Papa Parse 5.7.0 (MIT), csv-stringify 6.8.3 (MIT), csv-parse 7.0.2 (MIT).
Papa Parse better fits this browser's delimiter detection; csv-parse is a viable alternative when a
single CSV family is preferred. Installing both browser parsers is unnecessary. No runtime dependency
was installed during this audit. Versions/licenses are observations, not a complete supply-chain audit
or measured bundle-size comparison.

The support converter at `apps/api/src/support/knowledge.service.ts:94-122` double-decodes
`&amp;lt;`, handles only a small entity list and can throw for out-of-range numeric entities.
[html-to-text](https://github.com/html-to-text/node-html-to-text) is a focused P3 replacement candidate.
Keep existing guide tests and verify table/paragraph output; no current guide failure was demonstrated.

The installed API `xlsx` 0.18.5 has published
[prototype-pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) and
[ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) advisories. Inspected production paths only
write workbooks; reads were found in tests. Do not present that as a demonstrated production parser
exploit. The smallest compatibility option is the maintained distribution documented by
[SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). ExcelJS is an alternative,
but its registry version 4.4.0 and older publication history do not justify calling it automatically
better maintained. Verify provenance, licenses, advisories and export parity before choosing.

Legacy API methods commonly assert `apiFetch<T>` results while newer photo/loss APIs already use Zod
parsing. Reuse the latter boundary pattern incrementally. Large modules (EmployeesTab 1,418 lines,
bonus service 1,972, shift service 1,874) are inspection signals, not proof that all their code is waste.
Extract only stable responsibilities exposed by actual fixes. Do not move the same business logic
into forwarding classes or create empty FSD layers. Existing application-owned forbidden hooks remain
incremental debt; vendor hooks are a separate category. No wholesale frontend rewrite is recommended.

## Verification and limits

Executed during this review:

- Knip 6.35.1 default run: 14 file, 95 export and 7 dependency/devDependency candidates. These are raw
  findings, not confirmed deletion counts. Explicit entries plus within-file usage filtering reduced
  noise. Entry-export mode still flags deliberate external/tool exports; it is not a CI gate yet.
- Repo-wide call-site searches and manual checks of entry points, runtime string dependencies,
  source contracts, SQL schema/migrations and existing feature decisions.
- Local executable kiosk/CSV reproductions, installed QueryObserver behavior and injected Redis
  expiration failure. Reproduction files/results were retained for this local task under
  `/tmp/vakhta-review-20260912/`; the scenario descriptions above are the durable record.
- API and admin-web TypeScript checks passed after the deletion batch.
- ESLint and Prettier passed for all four changed source files.
- Existing Telegram screens suite: 18 tests passed. No new tests of unused forwarding functions.
- Independent review of the four-file, 52-line deletion diff found no issues and confirmed that
  callback handlers/constants remain intact; it reused the executed checks without repeating them.

Full `pnpm check`, DB concurrency tests, browser screenshots, physical kiosk/Telegram journeys,
production data inspection, exhaustive vulnerability audit and bundle measurements were not run.
The source removals are unreachable code, so there is no changed visible layout to validate. Existing
CI is the integration gate; its result and release/announcement status are reported with delivery.

## Ordered implementation backlog

1. F1 kiosk request ownership; F2/F3 complete session isolation; B1 position transaction serialization.
   These need their focused invariant/journey tests and independent review.
2. F5/F6 one CSV import replacement with Papa Parse and existing Zod validation; B5 one backend CSV
   serialization boundary. Preserve the existing product flows and localized errors.
3. B2 consolidate temporal selection, B3 atomic expiry and B4 quota-before-voice/cancellation.
4. Remove the remaining verified dependency/domain/calendar clusters in coherent small batches;
   introduce a narrowly configured Knip check after false positives are encoded with justification.
5. Optional HTML conversion and legacy FSD/type-boundary improvements when their features are touched.

All items except the five listed source removals remain pending. This report does not claim that
identifying a defect fixes it or that passing cleanup checks validates the rest of the application.
