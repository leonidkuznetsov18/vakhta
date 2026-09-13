# Backend and frontend simplification review

Date: 2026-09-13. Inspected baseline: `6f347974856a17bea0c658e212bae328542e1123` (`master`).

## Scope and acceptance

The owner requested a repository-wide search for unused/dead code, unnecessary custom implementations,
duplication and simplification opportunities, with current behavior and design preserved.
This delivery is an audit: no application source, dependencies, database state, tests or UI changed.
Findings are implementation candidates, not completed fixes or a guarantee that every journey is correct.

Acceptance: inspect all application/package areas; verify deletion candidates against callers, tests,
entry points and configuration; identify concrete reuse boundaries; separate behavior-preserving cleanup
from bug fixes; give each group a proportional verification requirement. Preserve Nest modules, pure
domain rules, frontend FSD direction, recorded history, request ownership and existing visual output.

The previous [2026-09-12 audit](../2026-09-12/code-quality-review.md) remains historical evidence.
Its findings were not assumed current. In particular, position assignment now locks the employee row;
the previous missing-serialization finding must not be copied into the current backlog unchanged.

## Coverage and executed analysis

Tracked TypeScript files under each `src/` directory at the baseline:

| Area                            | Non-test files | Test files | Non-test lines |
| ------------------------------- | -------------: | ---------: | -------------: |
| Admin panel                     |            274 |         61 |         38,916 |
| API, including Telegram/support |            145 |         41 |         29,179 |
| QR kiosk                        |              1 |          0 |            429 |
| Worker                          |             22 |         12 |          3,400 |
| Contracts                       |             30 |          3 |          3,920 |
| Database                        |             26 |          0 |          3,380 |
| Domain                          |             56 |         31 |          4,869 |
| Localization                    |             14 |          1 |         12,430 |

This inventory includes preview/generated catalog code; file size is not a defect. Static workspace
analysis covers the whole graph. Manual review concentrates on flagged files, callers, repeated rules,
large orchestration modules and the correctness boundaries below; it is not line-by-line certification
of all 568 non-test files. SQL migration and runtime configuration inspection was targeted.

- Knip **6.35.1**, default run: **18 file, 109 export, 22 type and 7 dependency/devDependency candidates**.
- With explicit runtime/manual entries, `includeEntryExports` and `ignoreExportsUsedInFile`:
  **5 file, 68 export, 16 type and 6 dependency/devDependency candidates**. The remaining raw export
  count includes vendor primitives, tool entry exports and public API aliases; it is not a deletion count.
- jscpd **5.2.0**, minimum 12 lines/100 tokens, excluding tests, generated output, previews and i18n
  catalogs: **499 files, 7 exact clone pairs, 143 reported duplicated lines (0.177%)**. These are
  threshold-dependent lexical results, not a measure of semantic duplication or overall code quality.
- Repository-wide symbol/import/configuration searches and targeted Git history checks verified the
  candidate paths. Application sources contain no dynamic component-discovery glob loading the five
  orphan files.
- Three CSV failures were freshly reproduced by transpiling and executing the current parser locally.
  No production records, Telegram messages or external paid API calls were created.

The configured Knip entry set includes `.railway/railway.ts`, load scripts, documentation/release
scripts, API main/CLI files, worker main, panel main/preview, kiosk main, DB index/migrate/seed, domain
index/node and contracts/i18n indexes. Normal test/config plugins remain enabled.
Raw results and the CSV outputs are local scratch evidence in `/tmp/vakhta-simplification-20260913/`;
the durable findings and reproducible inputs are recorded here.

## A. Confirmed unused code and cleanup candidates

Priority in this section is P3 maintenance. None warrants changing the visible design.

| ID  | Source at baseline                                                                                                                                                              | Evidence and smallest coherent cleanup                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `apps/admin-web/src/shared/ui/calendar-period-field.tsx:29`; `shared/lib/calendar-range.ts:26`                                                                                  | `CalendarPeriodField` has no caller, including preview. Its 202-line UI and `createCalendarRangeDraft` form an obsolete branch; the latter survives only through that UI and its two tests. Remove the branch and its exclusive types/tests together. **Keep `orderedRange`, `unitDate` and `CalendarUnit`**: incident period calculation uses them. Reconcile the old picker description in `docs/engineering/features/incident-knowledge.md:78`.      |
| D2  | `apps/admin-web/src/components/ui/{field,radio-group,select,switch}.tsx`                                                                                                        | Four unreferenced vendor primitives, **477 lines** in total. No production/preview imports or configuration reference found. Optional inventory cleanup; leave active Calendar, SelectField, SwitchField and shared wrappers intact. Removing unused source does not establish a bundle-size improvement.                                                                                                                                               |
| D3  | `apps/admin-web/src/features/incident-management/ui/columns.tsx:26,140`                                                                                                         | `TRANSITION_ICON` has no read or external consumer; all seven icon imports and `LucideIcon` serve only this map. Remove map/imports/export together. Keep `STATUS_TONE`, `SEVERITY_TONE` and rendered columns unchanged.                                                                                                                                                                                                                                |
| D4  | `apps/api/src/scheduling/schedule.service.ts:1895`; `apps/worker/src/timers/events.ts:231`                                                                                      | Schedule's `localTime` has no caller and is the only use of that file's `formatLocal` import. `nextGreetingTask` says it is exposed for tests, but has no test/runtime caller; `backgroundTasks` is used only there. Remove those functions and exclusive imports. **Keep the separate active `localTime` in Telegram screens and actual greeting task admission.**                                                                                     |
| D5  | `apps/admin-web/src/features/schedule-management/ui/schedule-attention-card.tsx:18`; `model/use-events.ts:32`; `index.ts:3`                                                     | `ScheduleAttentionCard` remains only in its barrel and component test. `useScheduleAttention` is consumed only by that card. Overview now renders `TeamToday`. Remove the obsolete UI/hook/test/export as one candidate, after reconciling `overview.md:108`, which still says Schedule uses it. Keep `useCalendarEvents`, the server attention endpoint and active Overview query. This is test-only reachability, not a completely unreferenced file. |
| D6  | `packages/domain/src/shift-fsm/intervals.ts:114`; `qr/challenge.ts:33`; `access/roles.ts:42-46`; `scheduling/types.ts:61`; `handover/checklist.ts:181`; `requests/routes.ts:90` | No workspace callers found for `sumByState`, `QR_DEFAULTS`, `ADMIN_ROLES`, `HR_ROLES`, `isEnterpriseScope`, `isEditableStatus`, `isRemarkComplete`, `medicalOnly`. Eight declaration candidates. Check public exports and downstream builds together before removal; no deletion of whole modules or lifecycle rules.                                                                                                                                   |
| D7  | `apps/api/package.json:32,55`; `apps/worker/package.json:34`                                                                                                                    | API `bullmq`, API `tsx`, worker direct `testcontainers` have no current source/script consumers. Remove direct declarations with a pnpm-generated lock update. Worker uses `bullmq`; API tests use `testcontainers`; worker tests use `@testcontainers/postgresql`: retain these distinct dependencies. Removing a direct declaration may not remove its transitive installation.                                                                       |

Suggested first cleanup: D3/D4, followed by D1/D2; then D5/D6/D7 as coherent groups. Existing focused
tests, affected typechecks/lint and compilation when imports/exports/bundling change are sufficient.
Do not invent tests whose sole assertion is that an unused function no longer exists.
If removing Tailwind-scanned orphan files, inspect the resulting CSS/build and affected screenshots
if reachable styling changes; lack of imports alone does not prove generated CSS is unchanged.

## B. Reuse and simplification opportunities

### R1 — P2: CSV import duplicates a parser and validation contract

`apps/admin-web/src/lib/csv.ts:5-68` implements delimiter detection, quoting, header inference and
employee validation; `admin/ImportDialog.tsx:49-65` separately manages asynchronous file reads.
The API already defines personnel/name validation in `packages/contracts/src/identity.ts:7,57-60`.

Fresh source-level reproductions:

| Input                                      | Actual current result                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `0001;Табаченко Іван\n0002;Петренко Олег`  | First employee disappears because the header regex matches the surname.  |
| `0001;"Іванов Іван`                        | Unclosed quote accepted as a valid employee.                             |
| `0001,"Doe; Jane; Smith"\n0002,"Roe Jane"` | Quoted semicolons select the wrong delimiter; each row becomes one cell. |

Use [Papa Parse](https://www.papaparse.com/docs) for tokenization, explicit delimiter candidates and
structured parse errors, retaining string personnel numbers. Reuse the import contract's item schema
for validation; header recognition stays explicit application policy. Keep the existing table, labels,
preview and submission layout. The file-read owner must discard superseded results and block import
while the selected file is unresolved.

**Classification:** correcting these outcomes changes behavior. It must be a separate bug-fix batch,
not hidden inside an exact-behavior refactor. Tests: the three inputs, BOM/CRLF, leading-zero IDs,
reversed A/B file completion, read failure and attempted submission during parsing.

### R2 — P2: three backend CSV serializers have already diverged

`apps/api/src/bonus/bonus.service.ts:1321-1325,1970-1972` and
`apps/api/src/reports/losses.service.ts:365-368` maintain separate quoting logic. The losses helper
handles carriage returns; the two bonus helpers do not. None neutralizes formula-prefixed text.

Use one server export boundary with [csv-stringify's formula escaping](https://csv.js.org/stringify/options/escape_formulas/).
Preserve BOM, semicolon separator, line endings, localized headers, numeric values, column order,
download names and audit ordering. Explicitly characterize existing bytes before moving serialization.
Carriage-return/formula corrections are behavior changes; do not claim byte parity for those inputs.
No spreadsheet execution or production exploit was demonstrated during this audit.

### R3 — P3: calendar arithmetic and holiday labels are copied

- `features/schedule-management/model/planning.ts:32-58` contains `addDays`, a forwarding `shiftDate`
  and week generation; `model/calendar.ts:59-70` implements another UTC date/week generator.
  Reuse one pure business-date implementation within the existing slice; keep the fallback-to-month
  behavior of `periodDates`, Monday-first weeks and full weeks across month/year boundaries.
- `model/calendar.ts:443`, `ui/schedule-attention-card.tsx:43` and
  `features/overview/ui/team-today.tsx:58,78` each dynamically build holiday translation keys using
  double assertions. Remove the unused card first, then provide one typed localization helper for
  the two active consumers. Preserve unknown-code fallback and all three locale outputs.

Dates here are UTC calendar values, while `shared/lib/calendar-date.ts` adapts browser-local `Date`
objects for DayPicker. Do **not** merge those distinct semantics simply because names look similar.
Existing calendar/planning tests are the regression starting point; no new date library is needed.

### R4 — P3: the same attention endpoint has two client implementations

`features/schedule-management/api/staffing-api.ts` and `features/overview/model/team-today.ts:15-22`
both construct and validate `/admin/schedules/staffing/attention`. The obsolete card/hook in D5 explains
part of this duplication. After deleting that branch, verify remaining callers before extracting
anything: if only Overview consumes attention, move that endpoint adapter to its owner instead of
creating a new shared framework.

The Overview query deliberately uses the `overview` invalidation prefix, unlike schedule's scoped
keys. Do not blindly unify cache keys, polling ownership or access scoping along with the transport.
The new Schedule clients already pass the query signal to fetch; reuse that established pattern.
[TanStack Query documents this signal-based cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

### R5 — P3: repeated SQL projections and predicates

- `apps/api/src/shift/shift.service.ts:279-310,362-393`: identical list/detail projection and joins.
  Share the read projection/base query within the shift module while leaving list scope predicates,
  detail identity filtering, ordering, limits and errors explicit. Preserve the existing
  `unitOfShift`, `stateSinceSql` and `toActiveView` helpers.
- `apps/api/src/scheduling/plan-context.ts:136-151,407-422`: repeated absence overlap/type/status
  predicates. Share a named predicate, not the entire result mapping: rule-evaluation absence windows
  and calendar events have different outputs, including latest wellbeing check-in evidence.

These are concrete semantic reuse boundaries. Do not introduce a generic repository that hides
authorization, transaction ownership or SQL filtering. Focused read-result and access tests must
remain unchanged; any affected authorization/time boundary needs independent review.

### R6 — P3, higher implementation risk: background poller lifecycle is repeated

`apps/worker/src/media/runner.ts:33-52`, `timers/runner.ts:29-47`,
`photo-inspection/runner.ts:17-41` and `apps/api/src/bonus/bonus-task-runner.ts:14-32` repeat timer
ownership, immediate start, single in-flight work, draining stop and promise cleanup.

Reuse a small server-runtime lifecycle owner only if it simplifies these call sites; keep typed media,
timer, inspection and bonus dispatch/recovery work separate. A first extraction inside worker avoids
creating a new cross-app package merely to remove a few lines. Never put timers in `packages/domain`.

**Non-equivalence to preserve:** inspection polls every two seconds and has no explicit recovery
phase; the other runners poll every second. Timer/bonus recheck `stopped` after awaited recovery;
media currently does not. Recovery schedules, error observers and shutdown ordering must not be
silently standardized. Start with existing `bonus-task-runner.test.ts`, add relevant lifecycle
regressions and obtain independent recovery review before changing this code.

### R7 — P3: reduce public surface and migration shims selectively

`components/app/focus.ts` forwards to the existing shared focus helper; three dialog wrappers still
import it. `overview/attention.ts` forwards to the Overview public API; App still imports the shim.
Redirect consumers to the existing appropriate public path before removing forwarding files.

Knip also flags locally used declarations such as `parseCsv`, `PAGE_SIZES`, `queueLabel` and query-key
constants in the default run. At most remove unnecessary `export`; do not remove their implementation.
Unused vendor exports are lower priority than application-level duplication. Contract aliases such
as Arrive/Depart and Create/UpdateChecklist express endpoint vocabulary and are intentional reuse,
not repeated implementations to eliminate.

## C. Structural complexity requiring a bounded design

| Area                                                         | Concrete responsibilities to separate                                                                                                                                                                                                                               | Guardrails                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/schedule-management/model/use-workspace.ts:45-570` | Queries/selection, pure command availability and read-only reasons, mutation ownership, persistent retry queue, deferred draft creation and submit→publish chaining. Start by extracting the pure availability/reason calculation around lines 289-394.             | Keep Query as server state, existing draft/command stores as client state, complete-grid writes, actor/scope/observer ownership, revision checks and reason precedence. Moving all code to a class is not simplification.                                                                 |
| `apps/admin-web/src/admin/EmployeesTab.tsx:79-987`           | Creation form, directory columns/filters, activation, Telegram relink, status/position actions and profile integration. Extract one coherent employee workflow at a time, using existing employee-profile APIs, `AddDialog`, form validation and feedback controls. | Preserve current UI markup/classes, focus, field values after errors, persisted drafts and permissions. Some profile reuse already exists; do not build a second profile feature.                                                                                                         |
| `apps/api/src/bonus/bonus.service.ts:113-1972`               | Rule versions/evaluation, adjustments/review, reporting/export and period close/reopen. CSV boundary R2 is the smallest first extraction.                                                                                                                           | Pure scoring already exists in domain. Preserve monetary rules, immutable nominations, actor authority, transaction/lock order and audit. A full service rewrite is not justified by its line count.                                                                                      |
| `apps/api/src/scheduling/schedule.service.ts:152-1897`       | Version/write orchestration, assignment replacement, publication, acknowledgement and read projections. Reuse existing plan-context/command modules before extracting another abstraction.                                                                          | Keep batch validation and save inside the write boundary, audit/history, concurrency revision, publication lineage and recovery.                                                                                                                                                          |
| `features/overview/ui/overview-page.tsx:10,215-233`          | Overview directly calls the peer schedule feature's `writeSchedulePreset`.                                                                                                                                                                                          | This public-barrel import is still a peer-feature dependency. Move cross-feature orchestration to the page/app composition layer and pass a named callback; retain preset actor/month/person data and navigation order. Do not move business presets into domain-independent shared code. |

The exact clone detector also reported a short employee/unit column repetition in BonusPage and
similar blocks in overview/correction queries. These are lower priority: readable schema/column
declarations do not automatically benefit from factories with many options.

## D. Behavior findings that must stay separate from cleanup

The following were rechecked in current source; only the CSV cases above were freshly executed.
These observations are not claims of production failures.

| Finding                                    | Current evidence and status                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kiosk stale challenge ownership            | `apps/qr-kiosk/src/main.ts:299-338,364-390` still has unfenced overlapping challenge requests. Static A/B interleaving remains possible; prior executable evidence is historical. Preserve device pairing/credentials and fix with focused request-ownership tests.                                                                                               |
| Rejected session/teardown                  | `auth/useSession.ts:18-23` still prefers cached data; sign-out at 27-32 only clears Query. `clearPersistentState` has test callers and no production teardown caller. **Retain the reset function**: this is a wiring question, not useless code. Current Schedule drafts now have actor/scope ownership; do not repeat the old claim that they are unnamespaced. |
| Redundant navigation                       | `App.tsx:361-366` writes a subroute, then calls `setActive`, which writes only the section. Removing the second write corrects behavior; it needs a palette destination regression and must preserve the unsaved-changes guard.                                                                                                                                   |
| Position serialization                     | `identity/positions.service.ts:35-40` now locks the employee before reading history. The earlier unprotected assignment interleaving is superseded. No fresh database concurrency test was run here. Do not mechanically replace it with `lockEmployee`: that helper uses a different lock strength (`NO KEY UPDATE`).                                            |
| Current-position rule remains inconsistent | Employee list/place lookups now include a lower bound, but `employees.service.ts:813-829` (`currentPosition`) and `handover.repository.ts:129` still omit `validFrom <= now`; `shift.service.ts:333` checks only an open end. Consolidating these requires distinguishing present and historical lookups, plus effective-date boundary tests.                     |
| Redis quota expiry                         | `infra/short-term-store.ts:20-23` still separates INCR and first EXPIRE. Reuse an atomic operation through installed ioredis; [Redis documents the race and Lua remedy](https://redis.io/docs/latest/commands/incr/). A fix needs actual Redis failure/window semantics tests; no Redis outage was simulated this turn.                                           |

## Safe implementation order and verification limits

1. Remove verified leaf dead code (D3/D4), then orphan branches (D1/D2/D5) with documented ownership.
2. Review public exports/dependencies (D6/D7) and explicit migration shims (R7) as separate small concerns.
3. Consolidate pure date/label functions and local read predicates (R3/R5), proving existing outputs.
4. Address CSV, session, kiosk, navigation and temporal defects in explicit fix batches with regressions.
5. Extract bounded workspace/employee responsibilities only where it makes the next change safer;
   defer recovery-runner consolidation until its differing behavior is characterized.

No new product interaction, palette, spacing, component replacement or broad architecture migration is
proposed. Design preservation means retaining rendered structure/classes and checking desktop/mobile
screenshots for affected reachable UI during implementation. Domain/history/access correctness takes
precedence over removing a few lines. Do not delete legacy Telegram callbacks, queue consumers,
recovery adapters, command persistence or saved-version history based on import counts.

Preserve runtime `pino-pretty`, Railway and release plugins, DB/CLI/load-test entry points, preview
fixtures, shadcn's `lib/utils.ts` alias, current Annotorious/Panzoom integration and useful tests.
No new runtime dependency was installed; the analysis tools ran through pnpm's external tool cache.

This documentation-only delivery requires diff and formatting checks. Full build/typecheck/test suites,
browser screenshots, authenticated user journeys, real database concurrency/recovery, bundle-size
measurement and production deployment validation were not run. The audit does not use old successful
tests as fresh evidence. Implementation and its required checks remain pending.
