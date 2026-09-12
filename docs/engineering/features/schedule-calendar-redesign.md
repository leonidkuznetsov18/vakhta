# Schedule calendar redesign: engineering plan

Status: **planning complete; implementation not started**. Date: 2026-09-12.
Documentation authority: owner requests a separate feature consolidating all calendar research for
the full Schedule page redesign. Baseline inspected: `3260162a63508bd3bc92bb9da01d43b9f7f7b566` on `master`.
Product requirements and the canonical 50-ID catalog: [Schedule calendar redesign](../../features/schedule-calendar-redesign.md).
This is the engineering memory and implementation backlog, not a claim of shipped behavior.

## Outcome and scope

Deliver a usable staffing/planning workspace on desktop and mobile web while retaining the existing
Schedule and employee workflows. Preserve the catalog as 46 target capabilities and four separately
gated extensions. Treat capability rank as estimated manufacturing value, not build order.

The current task changes documentation only. Do not install a calendar library, migrate assignments,
grant master permissions or alter production schedules as part of this delivery. Follow the current
direct-master workflow with one writer/index owner and task-owned paths only.

## RECON: current behavior and ownership

The previously researched Schedule source at `4195d82` has no changes in the inspected scheduling
slice/service/contracts/schema through this baseline. Product docs and key contracts/schema/controller
were reread. This is source inspection, not a new execution of old tests or a production verification.

| Area                 | Observed source of truth                                                                                                        | Consequence for the redesign                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| UI and model         | `apps/admin-web/src/features/schedule-management/{api,model,ui}`; public `index.ts`                                             | Extend this coherent FSD slice; preserve existing prepared model/actions instead of a parallel calendar                                |
| Existing editor      | `model/planning.ts`, `model/store.ts`, `model/use-workspace.ts`                                                                 | Reuse full-payload serialization, batch diff, rotation, undo and persisted drafts; add server conflict protection                      |
| HTTP boundary        | `apps/api/src/scheduling/admin-schedules.controller.ts`, `packages/contracts/src/scheduling.ts`                                 | Current editors are ADMIN/PLANNER; approvers ADMIN/PRODUCTION_HEAD; master calendar edits need an explicit change                      |
| Service transactions | `apps/api/src/scheduling/schedule.service.ts`                                                                                   | Reuse lifecycle/revise/publication and request-aware transaction helpers; a lock alone does not prove stale-client protection          |
| Database             | `packages/db/src/schema/scheduling.ts`                                                                                          | Assignments have stored planned instants; input derives them from templates. One employee/business date per version is unique          |
| Period writes        | `PutAssignmentsCommand`, `ReviseScheduleCommand`                                                                                | Current writes replace the full month and accept no expected-revision precondition; visible-range filtering must never become deletion |
| Connected workflows  | [Requests](../../features/08-requests.md), [reminder delivery](shift-reminders.md), [existing workspace](schedule-workspace.md) | Preserve swap/absence approval, durable reminders and actual-shift history rather than duplicating them                                |

Current preserved foundations: template/day/night assignments, rotations, local batch preview and
undo/redo, draft/review/publish lifecycle, atomic published revision, historical versions and bot plan.
Current gaps include complete roster search (the existing UI retrieval is capped at 200), cross-month
workspace behavior, explicit demand/qualifications/eligibility, server stale-write preconditions,
custom per-assignment time input and segment/open-slot models. Some capabilities exist in another
workflow; absence from the calendar is not absence from the entire product.

## SPEC: decisions and unresolved gates

The product file owns all functional requirements, AC-01–11, UX-01–15 and the 50-row baseline. Do not
duplicate that catalog into a second standalone specification. If later implementation uses Spec Kit,
create a bounded milestone change under `specs/` referencing these IDs; keep this feature's roadmap
and delivered status here. Follow the repository's local Spec Kit guide when doing so.

| Decision                                      | Recommended starting position                                                                                                              | Blocks                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| D-01 Master authority                         | Scoped propose/prepare/submit; retain existing approver. No assumed direct publication or attendance powers                                | T-03 and any new master mutation                                      |
| D-02 Requirements and qualification ownership | Named administrator/production owner maintains effective-dated staffing and verified qualifications; unknown data is explicit              | T-06, then T-07/T-08                                                  |
| D-03 Rule severity and exceptions             | Overlap and required missing qualification are hard failures; configure rest/hours limits and approval authority before enforcement        | T-07; no invented legal or numerical limits                           |
| D-04 Time/segments/break semantics            | Stable parent assignment with ordered zone segments; explicit gaps/overlaps policy, relief coverage and whole-versus-part operations       | T-10/T-11; custom time must agree with attendance admission/closure   |
| D-05 Cross-month operations                   | Keep monthly publication ownership initially, aggregate calendar reads and atomically coordinate all affected versions for a single action | T-05 and cross-month T-09; decide review/publish grouping before code |
| D-06 Borrowing/interest                       | Employee interest plus authorized selection; source/destination scope and source coverage considered; no first-click auto-assignment       | T-08/T-12                                                             |
| D-07 Scope extensions                         | SC-46–49 stay deferred until an actual input/system/owner and separate scope approval exist                                                | T-15 only                                                             |

These are proposed policies, not recorded owner approvals. Foundations and UX preservation can proceed
independently. Resolve a gate before its dependent behavioral work, with a concrete reviewed proposal.

## DESIGN: architecture and reuse

- **Frontend:** keep `features/schedule-management` ownership for commands, draft orchestration and
  UI. If cross-feature composition with Requests/Operations is needed, use the page/widget layer and
  public slice APIs; do not introduce peer-feature imports or move business rules into `shared`.
- **State:** validated server snapshots, eligibility and presence belong to TanStack Query; navigation
  and filters belong to the existing routing/filter convention; persisted draft/undo and selection
  belong to the focused client store. Every draft is keyed by user and organizational/version scope.
  Do not mirror live query results into a second mutable calendar state.
- **Model:** pure transformations own period/grouping, exact diffs, counts and view models. Components
  render them and connect named actions. Preserve the project's React Compiler/hook restrictions.
- **Backend:** scheduling remains a Nest feature; request decisions use the existing request owner.
  Extract genuinely pure overlap, demand, qualification and time rules into `packages/domain` where
  justified. No framework/DB I/O in domain and no direct activity-interval writes from calendar commands.
- **Contracts:** validate every input/output with shared schemas. Define expected revision, idempotency
  scope, command outcome, conflict detail and warning/blocking reasons before endpoint changes.
- **UI primitives:** reuse shared calendar period controls, shadcn, RowDetail/WorkflowSection,
  TableCount/Paginator, LoadingState and Query feedback. Reuse English/Ukrainian/Russian catalogs.
- **Dependencies:** no calendar engine is selected by this document. Before choosing, spike only the
  missing requirements: resource grouping, virtualization, cross-month ranges, accessible drag and
  mobile list compatibility. Compare installed primitives first, then maintained libraries and their
  official APIs/licenses. Do not adopt a package solely because a competitor uses a calendar grid.

### Proposed data concepts and invariants

Retain schedule versions and stable links to existing assignments/actual shifts. Introduce demand,
open slots, qualification evidence, availability and segments only in their owning milestone.
Schema names and migration details are deliberately not finalized before D-02/D-04/D-05.

1. Assignment time is a positive interval with site timezone and business date. A custom interval
   records its relationship to the template without changing historical planned instants.
2. A segment belongs to a parent assignment. Changing a segment cannot silently change parent identity,
   adjacent times, ownership or publication scope. Define break/gap handling before requiring contiguity.
3. Replacing the existing employee/date uniqueness rule requires an explicit invariant migration;
   adding segments must not accidentally allow concurrent work. Read/write all connected consumers.
4. Coverage is calculated from requirements and eligible, non-overlapping assignments at the relevant
   time/role. A worker cannot satisfy two simultaneous slots. Relief/breaks use the accepted semantics.
5. Server overlap checks must cover active effective plans, excluding cancelled/superseded records,
   with serialization/constraints that protect concurrent transactions across units. Verify against real DB.
6. A slot has at most one effective assignee. Interest, offer, approval and assignment are distinct;
   losing a race returns an actionable result, not a second assignment.
7. Multi-version operations validate all expected revisions/scopes and commit as one logical operation
   or report an explicitly designed partial workflow before the user acts. Never silently save one month.
8. Rules have effective dates, owners and versions. Commit rechecks current eligibility, request state,
   scope and revision even if preview previously passed.

### Async ownership and recovery

Abort obsolete reads and key results by scope/date/grouping; older responses cannot replace the active
workspace or erase later edits. Preserve cached data during refresh and distinguish empty success from
failed dependencies. Missing qualification/presence/roster reads stay unknown with retry.

Draft writes require server revision preconditions. Retain rejected local work and show a before/after
reconciliation; never silently use last-write-wins. Explicit retry reuses the logical command key when
the outcome is uncertain. Double taps and competing publishers/claimants must be covered by invariants.

Commit schedule changes, required request decisions, audit and durable notification admission together
where they share the database. Queue/Telegram delivery happens after commit and can fail independently.
Reuse existing delivery/recovery paths; do not add a second publication notification channel. Present
queued/delivery-failed/acknowledged only when corresponding evidence exists. Cancellation/supersession
must fence obsolete reminders. Never claim exactly-once external delivery without provider support.

### Migration, compatibility and rollout

Use additive schema/contracts first. Backfill existing template assignments without altering historical
times, IDs used by attendance, or version lineage. Verify employee/date uniqueness migration and all
old consumers before enabling partial/multiple intervals. Preserve inactive reference labels.

Keep one authoritative scheduling writer through cutover. The current page can remain a temporary
fallback only while it safely understands the data; gate its editing when newer segments/custom fields
would be dropped. Prefer read-only fallback over lossy writes. Roll back admission of new features,
not recorded history. Do not promise an old UI rollback after incompatible data has been written.

Pilot with synthetic test records and then an explicitly selected unit; never fabricate production
employee actions. Retire old page composition after parity and recovery checks. Full redesign does
not require abandoning existing reliable services or replacing Vite with Next.js.

## Implementation backlog

All tasks are **not started**. IDs in the coverage column assign every SC capability to a delivery
stream; other tasks may depend on or integrate them. Each stream must be split into a reviewable
bounded implementation change before coding. All writes/Git operations remain sequential.

| Task | Deliverable / owned boundary                                                                                                                         | Dependencies                                     | Catalog coverage                                       | Exit evidence                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| T-00 | Record accepted operating policies and a measured baseline of standard planning/replacement tasks; product + feature memory                          | None                                             | Cross-cutting AC-11                                    | D-01–06 decisions resolved for the next stream; baseline task data and acceptance scenarios                      |
| T-01 | Schedule shell, day/week/mobile views, zone/people grouping, contextual edit and shared feedback; schedule-management + i18n                         | T-00 for prototype scope                         | SC-11, SC-12, SC-21, SC-30                             | UX-05–08/10–14, desktop/mobile screenshots, keyboard and standard edit tests                                     |
| T-02 | Preserve draft/review/history, templates, rotation, undo, notifications, personal plan and acknowledgement integration; existing schedule/bot owners | T-01                                             | SC-08, SC-09, SC-18, SC-19, SC-20, SC-24, SC-25, SC-28 | AC-01/06/10, published diff, correct worker audience, superseded reminder and recovery tests                     |
| T-03 | Scoped master proposal workflow and server enforcement; auth/domain + scheduling                                                                     | D-01, T-02                                       | SC-10                                                  | Allowed/denied actor-scope-operation matrix, no bypass through direct API                                        |
| T-04 | Complete roster search and server revision/idempotency safeguards; API/contracts + schedule state                                                    | T-01                                             | SC-23, SC-29                                           | Employee beyond 200 found, two-editor stale save rejected, draft retained, uncertain retry resolved              |
| T-05 | Cross-month day/week/fortnight/month reads and coordinated writes; scheduling/contracts + period model                                               | D-05, T-04                                       | SC-22                                                  | Month/year/DST boundary tests, all-version rollback on one failure, correct publication ownership                |
| T-06 | Effective staffing demand and qualifications; scheduling/domain/DB + configuration UI                                                                | D-02, T-04                                       | SC-01, SC-04                                           | Unknown demand, role-specific shortage and expiring qualification cases with audited configuration               |
| T-07 | Eligibility, overlap, rest, hours and preferences; pure rules + transaction boundary + calendar explanations                                         | D-03, T-05, T-06                                 | SC-02, SC-05, SC-06, SC-17, SC-33                      | Real-DB concurrent assignment protection, threshold/boundary/unknown-data tests, explainable candidates          |
| T-08 | Open slots and employee interest/selection; scheduling + bot + durable effects                                                                       | D-06, T-02, T-07                                 | SC-15, SC-16                                           | Competing claims cannot double-fill; required approvals, employee response and delivery failure recover          |
| T-09 | Period patterns, batch operations and accessible drag; schedule model/UI + saved-pattern persistence                                                 | T-04, T-05, T-07                                 | SC-26, SC-27, SC-31                                    | Exact diff preserves exceptions, drag/Move parity, fill/replace/undo and stale baseline cases                    |
| T-10 | Custom assignment time and segmented work; contracts/domain/DB + scheduling + dependent attendance/reminder consumers                                | D-04, T-05, T-07                                 | SC-32, SC-37                                           | Safe migration, whole/segment preview, unchanged history, custom start reminder and closure/admission agreement  |
| T-11 | Break/relief planning and workload distribution; scheduling rules + calendar                                                                         | D-04, T-07, T-10                                 | SC-35, SC-36                                           | Coverage during breaks, no actual-event rewrite, explicit comparison cohort and units                            |
| T-12 | Attendance/absence overlays, requests/swaps and borrowing context; page composition + existing workflow public APIs                                  | D-06, T-03, T-07, T-08                           | SC-03, SC-07, SC-13, SC-14, SC-34, SC-38               | Approved/pending/unknown distinctions, all approval routes, source-unit scope and atomic multi-month effects     |
| T-13 | Notes, linked records, retrospective reports, print/export and justified typed fields; owning feature APIs + schedule composition                    | T-05, T-10, T-12                                 | SC-39, SC-40, SC-41, SC-42, SC-43, SC-50               | Restricted-data checks, historical semantics, complete output, formula-safe export, long-data layouts            |
| T-14 | Revocable personal feed and explainable proposed slot allocation; scheduling + feed + proposal model                                                 | T-07, T-08, T-13 for export identity             | SC-44, SC-45                                           | Own published data only, revoked feed denied, stable event updates; proposal cannot bypass rules or self-publish |
| T-15 | Separately scoped demand forecasts, planned/actual costs and HR/payroll exchange                                                                     | D-07 plus approved data/contracts and cost model | SC-46, SC-47, SC-48, SC-49                             | Separate specification, input quality, reconciliation, financial/privacy/integration invariant review            |

Tasks are dependency streams rather than a promise that each fits one release. Split T-12 to bring
read-only absence/presence visibility earlier if it requires no new authority; retain the same SC IDs
and acceptance checks. A first rollout can include T-01/T-02/T-04 and read-only overlays without
claiming staffing demand, eligibility or master writes are implemented.

## UX evidence and reuse decisions

### Deep research follow-up: 2026-09-12

[Detailed report](../../research/2026-09-12-deputy-wheniwork-calendar-deep-research.md), based on
26 primary sources, public API documentation and selected public repository files; Vakhta source
baseline `3fdf2c7f98e11c83bddfaeda54eb870d6e97ce57`. Five official illustrations accompany the report,
including newly inspected coverage and auto-assignment screens. This is documentation and public
source inspection, not an authenticated competitor trial or calendar implementation.

The following evidence sharpens the existing backlog without adding SC IDs or approving D-01–07:

| Finding                                                                                                  | Implementation consequence                                                                           | Existing ownership         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| Deputy simple coverage counts daily area shifts                                                          | Calculate time/role readiness separately; never label daily counts as continuous qualified coverage  | SC-01; T-06/07             |
| Deputy auto-fill uses empty shifts; When I Work uses unpublished OpenShifts                              | Distinguish internal unassigned work from employee-visible offers                                    | SC-15/16; T-08             |
| When I Work exposes hypothetical baseline and alternative evaluation APIs                                | Preview the complete proposed batch and boundary periods; recheck the final state at commit          | SC-02/29/31; T-04/07/09    |
| Competitor warnings, employee pickup restrictions and recipe score penalties are different mechanisms    | Record actor/action severity rules; a positive score cannot override a hard qualification constraint | SC-04–06/45; D-03; T-07/14 |
| Night-shift day counting and hour attribution differ                                                     | Keep business dates, elapsed hours and reporting allocation explicit                                 | SC-22/32/35; D-04/05       |
| Linked-part operations can affect hidden areas                                                           | Preview whole/part scope and every affected area/version                                             | SC-36/37; T-10/11          |
| When I Work break updates delete omitted existing breaks; Vakhta writes replace the month                | Define collection semantics and preserve hidden records in all partial-view edits                    | SC-29/36; T-04/11          |
| Publication, notification and acknowledgement have distinct evidence                                     | Retain durable delivery and recovery; never equate saved/published with received                     | SC-08/09/18; T-02          |
| When I Work documents limited shift-history retention                                                    | Preserve Vakhta's own required audit/history; do not copy the competitor retention window            | SC-19; T-02                |
| Deputy's public recipe LICENSE prohibits reuse; current calendar source was not found for either product | Use documented concepts; do not import recipes or infer a frontend library/private solver            | SC-45; T-14                |

The report defines twelve future acceptance scenarios covering staffing, concurrent edits, full-batch
validation, period boundaries, hidden parts, collection updates and delivery recovery. They are
proposed checks, not executed tests. No calendar package or new microservice was selected.

Lean recommendation remains **Proceed and simplify**: shorten standard planning/replacement paths,
keep advanced segmentation optional, and measure task time/contacts/corrections against the current
workspace before claiming savings. No new worker check-ins or production/OEE claims follow from
this research. Resolve policy/data ownership before dependent behavior changes.

The product brief now embeds the owner's seven selected screenshots in its
[visual reference gallery](../../features/schedule-calendar-redesign.md#visual-references-real-deputy-and-when-i-work-interfaces).
Each caption identifies the observed interface, the intended Vakhta adaptation and the relevant SC/UX
requirements. Use that gallery during design and review; these are competitor references, not Vakhta
implementation evidence. Images remain hosted by the official documentation providers.

Research was performed on 2026-09-12 using official help pages, more than ten visually inspected
desktop/mobile illustrations and an inspected animation frame. It was not an authenticated product
trial. Native iOS screenshots do not establish responsive-web or Android parity. Availability may
depend on plan/rollout. The following links are portable primary references, not local artifact paths.

| Reference                                                                                             | Observed/documented mechanism                                                | Adopt or improve in Vakhta                                                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Deputy editor image](https://help.deputy.com/hc/article_attachments/10617407757839)                  | Contextual editor with overall time, area rows, breaks and notes             | Keep context/defaults; shorten standard shifts; use existing row details for existing records |
| [Deputy split preview](https://help.deputy.com/hc/article_attachments/12396494136079)                 | Timeline, exact split-time input and resulting shifts                        | Adopt result preview and precise input; avoid nested overlay stacks                           |
| [Deputy mobile form](https://help.deputy.com/hc/article_attachments/13447468620175)                   | Vertical fields and prominent bottom action                                  | Adopt phone-specific composition; optional complexity stays disclosed                         |
| [Deputy mobile day/week](https://help.deputy.com/hc/article_attachments/13447493590031)               | Readable day list versus narrow seven-column week; linked parts              | Prefer day workflow; name whole/part scope, reduce repeated location/timezone text            |
| [When I Work desktop](https://d1fc5y2qmnxpnr.cloudfront.net/assets/Scheduler-reference-1024x648.png)  | Period/grouping controls, filters and open-shift row                         | Adopt orthogonal controls; prevent unfilled cards from consuming the entire workspace         |
| [When I Work candidates](https://d1fc5y2qmnxpnr.cloudfront.net/assets/view-eligible-web-1024x960.png) | Own/other schedule candidate groups; selected counts; two green save actions | Show source scope and eligibility reasons; give the current workflow one clear primary action |
| [When I Work mobile](https://d1fc5y2qmnxpnr.cloudfront.net/assets/all-shifts-view-iOS-1.png)          | Week strip with selected-day list                                            | Adopt for mobile web; strengthen person identity/status and explicit duration units           |

Deputy micro-scheduling treats linked area cards as one shift: deletion/publication can affect every
part; timesheet approval for this mode is website-only. Its split preview is useful, but Vakhta must
explain operation scope and maintain understandable mobile rules. The linked article also describes
dragging dates while restricting date edits in the details form; do not infer uniform interaction
behavior without a live check. [Deputy micro-scheduling](https://help.deputy.com/hc/en-au/articles/10611651590159-Managing-micro-scheduled-shifts-and-timesheets).

When I Work labor sharing adds eligible people from other schedules. Shared-slot pickup approval is
enabled by default, can be disabled on the web, and cannot be disabled on mobile; repeating shifts and
templates do not support shared slots in the consulted guide. Adopt candidate discovery, not those
policy differences or automatic permission assumptions. [Labor sharing](https://help.wheniwork.com/articles/labor-sharing-reference-guide/).

### Functional source index

These sources support mechanisms considered in the catalog, not identical availability in both
products. Manufacturing ranking and Vakhta-specific constraints are our proposals. Sources were
consulted during the preceding research; this consolidation does not claim a fresh live product test.

- SC-01/15: [Deputy staffing coverage](https://help.deputy.com/hc/en-au/articles/4688843118223-Using-a-simple-staff-coverage-planner-when-scheduling), [When I Work OpenShifts](https://help.wheniwork.com/articles/scheduling-an-openshift-computer/).
- SC-02/04/05/06/17: [Deputy recommendations](https://help.deputy.com/hc/en-au/articles/4688700112015-How-do-I-ensure-that-a-team-member-is-recommended-for-a-shift), [When I Work rules](https://help.wheniwork.com/articles/scheduling-rules-reference/), [overtime visibility](https://help.wheniwork.com/articles/overtime-visibility/).
- SC-11/12/21/22/30/31: [desktop views](https://help.wheniwork.com/articles/schedule-views-computer/), [scheduler reference](https://help.wheniwork.com/articles/scheduler-reference-guide-computer/), [iOS views](https://help.wheniwork.com/articles/schedule-views-iphoneipad/), [Deputy shift creation](https://help.deputy.com/hc/en-au/articles/4688731978639-Creating-shifts-on-your-schedule).
- SC-24/25/26/27: [Deputy schedule templates](https://help.deputy.com/hc/en-au/articles/4688863723791-Saving-and-loading-schedule-templates). Cross-month Vakhta rotations are our target, not a claim of monthly template support in Deputy.
- SC-32/36/37: [Deputy micro-scheduling](https://help.deputy.com/hc/en-au/articles/10611651590159-Managing-micro-scheduled-shifts-and-timesheets).
- SC-16/38: [When I Work labor sharing](https://help.wheniwork.com/articles/labor-sharing-reference-guide/).
- SC-39/40: [When I Work annotations](https://help.wheniwork.com/articles/using-annotations-computer/); connecting handovers is a Vakhta integration proposal.
- SC-42/43: [Deputy printing](https://help.deputy.com/hc/en-au/articles/4688737187343-Printing-your-schedule).
- SC-44: [When I Work calendar sync](https://help.wheniwork.com/articles/syncing-your-schedule-to-a-calendar-app-computer/); subscription refresh is not instantaneous delivery.
- SC-45: [Deputy auto-scheduling](https://help.deputy.com/hc/en-au/articles/4688892429839-Using-Auto-scheduling), [When I Work auto-assign](https://help.wheniwork.com/articles/auto-assign-shifts/).
- SC-46/47/48: [When I Work forecast tools](https://help.wheniwork.com/articles/forecast-tools/), [Deputy smart scheduling](https://help.deputy.com/hc/en-au/articles/4688947197455-Smart-Scheduling-101). These are not a complete payroll specification for Vakhta.
- SC-50: [Deputy custom fields](https://help.deputy.com/hc/en-au/articles/6030947375247-Creating-custom-shift-fields).
- Preserved Vakhta communication, requests and history: [current Schedule](../../features/05-schedule.md), [Requests](../../features/08-requests.md), [workspace evidence](schedule-workspace.md), [reminders](shift-reminders.md).

## VERIFY and HARDEN

### Required implementation evidence

| Boundary            | Evidence required before the affected stream ships                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure rules/model    | Overlap, rest, qualifications, demand counts, partial/night/DST time, rotations, serialization and exact diffs                                                        |
| Real DB/concurrency | Stale draft save, two publishers, competing slot claims, cross-unit overlap, request plus multi-month rollback, migration invariants                                  |
| Failure recovery    | Commit/queue failure, uncertain retry, cancelled/superseded reminders, failed dependent reads, retained local draft and user-session isolation                        |
| UI                  | SC journeys, no-op actions, complete counts, unknown/empty/loading/error states, keyboard focus, mobile touch alternatives, all locales                               |
| Connected surfaces  | Bot publication/acknowledgement/request/reminder scenarios when affected; kiosk/admission/closure only when custom-time changes touch them                            |
| Visual QA           | Capture and inspect actual desktop and mobile screens, including long data, open details, editor, publication and failure; screenshots are not replaced by unit tests |
| Output/privacy      | Print/export completeness and units, formula-safe spreadsheet values, own-data calendar access and revocation, scoped candidate details                               |

Use the smallest relevant checks from [the testing policy](../testing-baseline.md). Existing commands
for future implementation include the following; they were **not run for this documentation task**:

```sh
pnpm --filter admin-web test src/features/schedule-management
pnpm --filter admin-web typecheck
pnpm --filter api test src/scheduling/schedule.service.test.ts
pnpm --filter api typecheck
pnpm --filter @vakhta/domain test
pnpm --filter @vakhta/contracts test
pnpm --filter @vakhta/i18n test
```

Add focused paths for new tests and changed request/worker consumers when they exist; verify package
scripts before executing later. Run affected ESLint and build only as justified by changes. Real DB
tests require the existing container setup. High-risk implementation requires one independent fixed-diff
review. Documentation alone needs format, links, coverage and diff inspection, not that review or full CI duplication.

Delivery evidence must distinguish local checks, queued/running CI, released metadata and deployed
behavior. Preserve the existing release-to-Telegram announcement job; do not send manual duplicates.
Do not label a planned milestone as complete from test counts of the earlier workspace implementation.

## Lean review

Recommendation: **Proceed with the redesign; simplify its default paths and defer ungrounded extensions.**
Evidence is the owner's stated need, current source constraints and reviewed competitor interfaces,
not direct shop-floor observation. The default workspace should answer who is planned, what is known
about readiness and which permitted next action resolves a problem. Contextual defaults, candidate
selection, batch previews and recoverable drafts reduce search/re-entry/rework.

New worker burden must stay optional and justified: interest/acknowledgement is task-specific, not a
new check-in per segment or repeated data entry. Calendar changes do not expand actual QR/report duties.
Unnecessary custom fields, decorative metrics and fifty permanent buttons fail this recommendation.

Experiment: compare current UI and prototype on identical synthetic tasks with a planner and day/night
masters, then select a bounded unit pilot. Measure active task time, manual contacts, corrections,
backtracking, assistance and unresolved slots before shift start. Set targets after measuring baseline.
Guardrails: no unauthorized changes, invisible partial save, missed staffing/qualification constraint,
false presence, history loss or unannounced schedule change. A guardrail failure pauses the affected
capability; preserve manual workflow and the recorded evidence. No throughput/OEE claim follows from
scheduling interaction measurements.

## Verification record and remaining work

### GitHub backlog research follow-up

Owner request, 2026-09-12: review [Schedule epic #1](https://github.com/leonidkuznetsov18/vakhta/issues/1),
update existing Calendar/redesign issues and create only genuinely missing work. Reviewed all
17 original Schedule children and related workforce discovery. The original issue catalog pins sources
from before the deep-research revision; its `catalog.json` and publication receipts remain historical snapshots.

- Updated #1 and #4–20 with research links, concrete design constraints and additional acceptance
  checks, preserving original criteria, stable markers, source IDs, titles and lifecycle labels.
- Updated #39/#40 with explicit reuse mappings to Schedule owners; #48/#49/#53 already provide
  related qualification/document/delivery discovery and needed no duplicate implementation issue.
- Created [#54 — Schedule | Rollout and acceptance | Verify calendar parity and safe cutover](https://github.com/leonidkuznetsov18/vakhta/issues/54)
  as a native child of #1. It owns the cross-cutting evidence matrix, compatibility/cutover runbook,
  relevant desktop/mobile/worker journeys and measured pilot. It adds no SC capability; SC-46–49
  remain deferred behind #20 and D-07.
- The 50-capability catalog and T-00–15 implementation ownership remain unchanged. #54 reuses child
  evidence and closes only against explicit accepted scope, not merely a successful first release.
- Live GitHub readback passed for all 20 edited bodies and new #54: exact text, original titles/states/
  labels, unique stable markers, all SC-01–50 source IDs and 18 native Schedule children. Unrelated
  issue bodies remained unchanged; #20 retains its deferred status. Local document links, formatting
  and diff-whitespace checks passed. No application code, runtime tests or production actions changed.
- Lean review: **Proceed / Simplify**. Enrich existing streams rather than duplicate component,
  rule-engine or workflow ownership; add only the missing integrated acceptance owner. No new worker
  steps, guessed performance targets or production/OEE claims are introduced.

### Documentation delivery evidence

- 2026-09-12: documentation-only consolidation. Inspected current product docs, feature memory,
  scheduling contracts/schema/controller and source continuity since the original research baseline.
- 2026-09-12 deep-research follow-up: checked local links across the three changed documents,
  26 unique referenced source footnotes, five report illustrations and the unchanged ordered
  SC-01–50 catalog. Prettier and diff-whitespace checks passed. Newly inspected competitor images
  cover Deputy area coverage and When I Work auto-assignment; no Vakhta UI or runtime was changed.
- Canonical product catalog retains SC-01–50 and the 7/19/24 baseline split. Backlog maps each ID to
  one stream; cross-cutting acceptance and all 15 UX recommendations remain explicit.
- No feature code, schema, permissions, employee data or notification logic changed. No application
  test, screenshot of a new Vakhta UI, production migration or runtime verification is claimed.
- Documentation checks passed: Prettier on all five owned Markdown files, `git diff --check`, ordered
  unique SC-01–50 rows, the 7/19/24 baseline counts, exactly one backlog mapping per capability,
  15 UX requirements, 11 cross-cutting criteria and resolution of every local Markdown link.
  No machine-local research artifact paths remain in the new documents. Delivery results are recorded
  with the task handoff. Concurrent Spec Kit/master-agent/research work is outside this delivery.
- Next implementation step: resolve the next stream's policy gates and prepare a bounded T-01/T-04
  design/prototype with the SC/AC/UX IDs it will satisfy. All T-00–15 implementation work remains open;
  T-15 additionally requires separate scope approval.

## Full epic implementation — 2026-09-13

Authority: owner requests the entire live epic #1 in one task. Active Spec Kit directory:
[002-schedule-calendar-redesign](../../../specs/002-schedule-calendar-redesign/spec.md).
This supersedes the earlier documentation-only task restriction for this implementation; it does
not approve unresolved domain policy. Writer/index ownership transferred after clean f66cafc.

- Recon read all 18 live children (#4–20/#54), dependency/acceptance additions, current slice,
  controller/contracts/schema, existing workspace memory and research scenarios. The issue catalog
  under 001 remains historical. Source hashes and requirement mapping are in the implementation spec.
- Spec/plan/tasks analysis: 50 capability rows, 18 issue owners, 58 initial tasks, no unmapped
  capability; AC/UX and twelve integrated scenarios retain #54 ownership. Independent prototype
  scope is ready. D-01–07 and real participant baseline/pilot are unresolved high-impact gates.
- Owner questions sent for master authority, dated norms/qualification owners, rule severity,
  time/segment/break semantics, atomic monthly effects, borrowing approval and SC-46–49 inputs.
  No answer is inferred from elapsed time or a preselected option.
- Lean design: Proceed / Simplify. Reuse template/batch/draft/publication owners, present a readable
  day team and contextual actions; no new worker check-ins or compulsory advanced fields.
- Component research favors a controlled rendering boundary on installed Table 9.2.4/shadcn;
  source comparison in the spec research.md includes current paid resource terms. The first
  rendering increment is implemented; the remaining epic stays open.

### Controlled calendar rendering increment

- Owner design correction: component selection, Sheets, layout and purposeful colors are free design
  choices. Updated AGENTS.md and engineering standards; expanded sub-rows are no longer mandatory.
- Added one controlled resource calendar and feature-owned projection for zone/person grouping,
  day/week navigation and a mobile date strip. Details use a responsive Sheet in both the new calendar
  and existing monthly views. Existing draft, template, review and publication owners remain in place.
- Recorded assignment times survive template edits; grouping and monthly zone filtering preserve
  hidden assignments and metadata. Removing a filtered employee row affects only that zone.
  Opening/closing details preserves keyboard focus, including after the opening row disappears.
- Synthetic prototype: 500 employees, 20 populated zones plus one empty, 7,000 assignments, cross-month
  dates, visual segments and explicit Move conflict feedback. Custom time/segment persistence, drag,
  production cross-month writes and complete roster loading remain unimplemented.
- Verification executed on 2026-09-13: 38 tests across calendar/grid/planning/workspace passed;
  affected ESLint passed; admin-web build including TypeScript and React Compiler passed.
  Existing Rollup dependency annotation and bundle-size warnings remain. No backend/migration changed.
- Captured and visually inspected desktop 1440×900 and mobile 390×844 synthetic views, English Sheet
  editing, Russian monthly details, Ukrainian day view and full-width Sheet. Ukrainian mobile document
  width was 390px; closing details returned focus to its assignment. Preview locale initialization now
  precedes catalog consumers. These are preview checks, not production or participant acceptance.
- Independent code review findings resolved: mobile period fallback, monthly filter parity, tabpanel
  semantics and disconnected-trigger focus recovery. Reviewer reused valid deterministic checks;
  visual inspection was performed by the implementation owner.
- Lean completion: Proceed / Simplify. The calendar stays in place while details open; contextual
  actions reuse existing editing and no-op guards. Missing staffing norms and presence remain unknown.
- Full epic HOLD: D-01–07, real participant baseline/pilot and remaining child scope are pending.
  Next independent work: #9 complete roster and stale/uncertain draft write recovery.

### Owner UI corrections — 2026-09-13

- Month always opens the employee D/N matrix with assignment Sheet; removed the misleading zone
  aggregate renderer. Read-only assignments expose complete details without editing inputs.
- Shared amber/indigo day/night palette and visible hover/focus/pressed states; vertical date
  separators span headers and rows. Cards use fixed height and bounded title/type/status previews;
  their complete values remain available in the Sheet. Removed the time/duration dot separator.
- All layouts show up to three assignments per cell. Overflow says `N more` for hidden items only,
  and opens the complete list. Two assignments are both visible without a redundant count button.
- Day chooses an individual date; week chooses only whole-week rows; month selects month/year
  without day cells. The month scope picker remains authoritative. Boundary weeks explicitly show
  only loaded dates; cross-month operational reads/writes remain owned by #10.
- Shared overlay focus now preserves native accessibility focus without automatically requesting
  a tooltip. Intentional keyboard focus and hover still reveal tooltips; shared UI memory has details.
- Lean: Simplify. Remove the click needed to discover a second teammate and the ambiguous total;
  choose the same time unit as the current view. No new worker input or operational policy.
- Local regression run: 39 tests across date fields, resource calendar, projection, workspace,
  tooltip and icon button passed. i18n and admin-web TypeScript/Compiler build passed; affected ESLint
  passed. Existing dependency annotation and bundle-size warnings remain. Final evidence below is
  from synthetic preview data, not production or participant acceptance.
- Screenshots: [evidence directory](../evidence/schedule-ui-2026-09-13/). Desktop 1280×720 matrix, week/month
  pickers and Sheet inspected; 390×720 mobile list and full-width Sheet inspected. Document width
  remained 390px. All ten i18n catalog checks passed. Screenshot evidence and comments will accompany each completed issue;
  incomplete epic criteria remain open, including policy answers and participant baseline/pilot.

### Period navigation follow-up — 2026-09-13

Week selection now includes month and year dropdowns; changing either only browses weeks, and
choosing a week changes the loaded month and preserves the selected period mode. Month/year
selection is directly beside the period mode controls. Empty-month and history views retain their
month navigation. No backend cross-month write behavior changed. Local date-field/workspace
regressions: 19 passed, including browsing another year without committing until a week is selected
and retaining month mode across scope changes. i18n catalogs: 10 passed; affected ESLint and
admin-web TypeScript/Compiler build passed. Updated week/month screenshots supersede earlier picker
captures. Lean: Simplify; period navigation is available where the period is read.

### Calendar component prototype acceptance — #5

T005 completed after the owner UI corrections: 500-worker/7,000-entry group projections, 8.5-hour
custom interval rendering, overnight date, whole/segment inspection, keyboard conflict and successful
Move, bounded overflow, desktop/mobile capture and measured constraints. Exact sample values and
limitations are in the [component research](../../../specs/002-schedule-calendar-redesign/research.md).
Five focused date-picker tests, affected ESLint and admin-web TypeScript/Compiler build passed.
The date picker now also exposes future years rather than DayPicker's default current-year ceiling.
Segment editing, custom-time persistence, production move rules and participant baseline remain
owned by later streams; prototype completion does not approve those policies. Lean: Proceed with
installed primitives; no paid engine or new worker input is needed for the demonstrated renderer.

### Complete schedule roster — first bounded #9 increment

- Added validated `/admin/employees/page` UUID cursor reads (maximum 200 per page), exact totals,
  stable ordering and a read-only repeatable-read transaction for each page/count/current-position
  snapshot. Existing directory read roles and the legacy list contract are unchanged.
- Schedule loads every page under Query cancellation and publishes only the completed directory.
  Changed totals, duplicate/nonprogressing cursors and incomplete reads surface a localized retry;
  cached complete data remains available. Historical identity lookups wait for the complete directory.
- Batch search covers every loaded worker; shared pagination retains the full filtered total.
  "Select shown" affects only the displayed page. Loading/failure does not invent a zero count.
  Employee 205 can be selected and saved without dropping another employee's hidden assignment.
- Verification: PostgreSQL integration 4 tests; roster/workspace 23 tests; API typecheck, admin-web
  TypeScript/Compiler build and affected ESLint passed. Independent access/transaction review found
  no demonstrated blocker. Synthetic preview screenshots captured and inspected at 1280×720 and
  390×720: `roster-pagination.png`, `roster-search.png`, `roster-mobile.png` in the evidence directory.
- Consistency is per page, not one snapshot spanning all HTTP requests; changes with the same total
  may produce a mixed-time directory. This increment does not change eligibility or expand read
  authority. Expected revisions, command receipts, actor-scoped recovery and #9 closure remain open.
- Lean: Simplify. Find an authorized worker once, retain selection across search/pages, and never
  require a planner to know which API page contains the worker. No extra worker input.

### Stale schedule writes — second bounded #9 increment

- Migration `0040_schedule_revisions` initializes a positive revision and advances it on every
  version update. Public save/submit/return/publish/revise/delete commands require an expected
  revision, checked after acquiring the version lock in the same transaction. Detail reads share
  one repeatable-read snapshot; save returns the revision of the assignments actually committed.
- HR hard-delete is an existing assignment writer: it now locks parent versions and advances the
  revision for the actual deleted assignment set. A reviewed schedule changed by that operation
  cannot be published using the old revision. Internal request publication keeps its transaction
  and advances revisions; request rollback regression remains passing.
- Local draft baselines persist their original revision. Same-grid/newer-revision changes are still
  conflicts. A rejected save retains the draft; lifecycle buttons match the conflict/legacy guards.
  Discard removes the local draft and clears its obsolete conflict warning. Revisionless legacy
  drafts require the existing explicit review/recovery action; no silent rebinding occurs.
- Rolling deployment: old API responses without revision remain readable (client sentinel 0),
  including create responses; all existing-version writes remain disabled until a fresh revision
  is available. The authoritative server contract and mutation preconditions require positive values.
- Verification: Schedule 10, Requests 9 and HTTP boundary 6 tests passed against disposable PostgreSQL;
  panel/planning 27 tests passed, including concurrent-save rejection, full draft retention,
  same-grid stale lifecycle controls and legacy API create/read compatibility. API typecheck,
  admin-web TypeScript/Compiler build and affected lint passed. Independent review findings on HR
  deletion and no-op lifecycle controls were fixed and regression-tested; create compatibility was
  also fixed. Desktop/mobile stale-draft screenshots were captured and inspected.
- Prior roster CI stopped at formatting of three docs; this delivery formats those files. No prior
  failed/cancelled CI run is described as passed. Migration/deployment confirmation is separate.
- Remaining #9: durable command receipts, timeout outcome reconciliation, actor/session draft
  isolation and complete recovery journeys. A stale response alone cannot resolve a lost success.
  Concurrent HR deletion/new assignment races may abort via database conflict/FK protection; they
  do not silently commit without the touched version's revision change. No automatic mutation retry.
- Lean: Prevent rework. Preserve the planner's local intent when the server changes; stop actions
  that cannot safely execute and keep the current schedule readable during rolling deployment.

### Actor-owned local recovery — #9, 2026-09-13

- New draft/baseline/revision/history keys include actor, site, unit, month and version; an old bare
  version key is retained without displaying its assignments or attributing it to the next account.
  A localized notice explains why it was not restored. Overview worker presets now include the actor.
- Schedule list/detail/template/roster/identity reads include actor and current grants. Account/access
  changes remount the feature. Late callbacks require their original per-mount owner token plus the
  same observed Query instance; a warm-cache A→B→A round trip cannot revive an obsolete callback.
  A newer cached detail revision is never replaced by an older successful mutation response.
- Independent review found the warm-cache callback hole; a generation guard and real warm-cache
  regression resolved it. Workspace 23 tests and planning 8 passed. TypeScript/React Compiler build
  and scoped ESLint passed. The existing invalid-storage notice used an ignored Feedback prop; it
  now renders a visible error. No automatic mutation retry or command-receipt completion is claimed.
- Captured and inspected `draft-ownership.png` (1280×720) and `draft-ownership-mobile.png` (390×720)
  under `docs/engineering/evidence/schedule-ui-2026-09-13/`. The screenshot uses a temporary synthetic
  unowned draft in preview storage; it was removed afterwards. Preview's initial version now has a
  stable fixture identity for reproducible reload/recovery checks. Production actions were not used.
- Lean: protect the planner's intent and prevent another account from silently continuing it. Keep
  a readable server schedule while preserving older unowned bytes; do not guess ownership.
- Remaining #9: atomic durable receipts, outcome resolution after lost responses and their recovery
  journeys. Draft namespacing does not encrypt browser storage or prevent direct device access.

### Accepted prototype and delivery checkpoint — 2026-09-13

#5 is closed with completed criteria and screenshot comment 5649238116. Advanced features shown only
in the spike remain prototypes. CI 34723539292 for 14d33604 succeeded in all jobs: checks, release,
Telegram announcement, API/worker images and Pages. This pipeline result does not establish a real
participant baseline, selected unit pilot or production migration inspection. #4/#6/#9 and the
remaining domain streams retain their outstanding acceptance criteria.

### Durable command recovery — #9, 2026-09-13

- Added validated `POST /admin/schedules/commands` for create/save/submit/return/publish/revise/delete.
  The existing idempotency table binds the command UUID to actor, action, target and payload. Equal
  identities serialize; the original result is committed with schedule/audit/event/outbox/timer
  changes. Receipt replay checks current scope authorization before disclosure, including deleted
  versions. Mismatched identities return a conflict instead of a different command's result.
- Existing-version execution locks the version before refreshing grants and checking revision.
  Internal Requests retains its transaction; old revision-guarded endpoints remain compatible. Source
  copies must share site/unit/month because the existing copy operation preserves literal dates and
  assignment scope. No cross-month copy contract is introduced.
- The panel persists validated intent before sending, retains unknown outcomes across reload, and
  exposes one explicit result-check action. New commands stay blocked while outcome is unknown;
  coded domain rejection preserves the draft. Newer edits/cached revisions and obsolete workspace
  generations remain protected. No automatic mutation retry or fallback to legacy write endpoints.
- Cross-tab queue admission, completion and retry lookup use the origin-wide Web Locks API with a
  fresh validated storage read under lock. Unavailable storage/locking fails closed. Independent
  review found and verified fixes for stale-tab overwrite and stale identity retry. The lock covers
  storage updates, not network requests; the server serializes equal identities and revision checks.
- Evidence: Schedule + Requests 26 tests, HTTP 7, durable-command hardening 8 and final lock-wait /
  revoked-grant regression 1 passed against disposable PostgreSQL. Contracts build/API typecheck
  passed. Panel recovery/workspace tests: 34 passed, including lost-success/reload, duplicate taps,
  newer local edits, two live queue stores, identity replacement and unavailable persistence.
  Final panel TypeScript/React Compiler build, affected ESLint, formatting and whitespace checks pass.
- Captured and inspected `command-recovery.png` (1280×720) and `command-recovery-mobile.png`
  (390×720). Synthetic preview applies the write then loses its response; explicit result checking
  clears recovery and restores editing. The fixture now uses domain-calculated overnight timestamps;
  weekly cards remain bounded and show the next-day date. Server receipt durability is covered by
  real DB tests, not the in-memory preview fixture. No production employee action was performed.
- Limits: browser storage is not encrypted; receipt authorization refresh does not serialize a
  simultaneous permission revocation with final commit. An old API without the new endpoint cannot
  resolve a queued command until updated. Production migration and participant/pilot acceptance
  remain separate. Previous delivery CI 34724106893 passed all jobs, including release/announcement.
- Lean: prevent duplicate work and preserve intent. Offer one clear recovery action instead of asking
  the planner to recreate a draft or guess whether a save succeeded.

### ACK reminder delivery hardening — accepted bounded increment

- Live #7 SC-18/20 and AC-10 require obsolete reminders to be suppressed. Recon found admission
  checks in `timers/reminders.ts`, while `outbox/relay.ts` revalidates only SHIFT_REMINDER. An ACK
  message queued before supersession/acknowledgement can therefore still be sent on the next relay.
- Scope/design: active `specs/002-schedule-calendar-redesign/plan.md`; tasks T067/T068. Reuse the
  existing pending-future-assignment predicate at ACK delivery/retry, support automatic/manual keys,
  validate recipient/version provenance, retain original outbox recovery owner. No ACK-all change.
- Lean: Proceed. Remove obsolete employee prompts and repeat acknowledgement work without adding a
  worker step. Guardrails: still-current unacknowledged future assignments retain delivery; stale
  messages become SKIPPED with a recorded reason. Verify with synthetic real-DB relay cases; no
  production worker/time savings claim. The completed implementation preserves live delivery while
  removing stale prompts; no worker input or new screen was added.
- Verification: worker `worker.test.ts` 17 and `timer-tasks.test.ts` 20: **37 passed**, including 13
  new ACK delivery cases (automatic/manual, superseded/acknowledged/retried, partial confirmation,
  cancelled/replaced/start boundary and malformed/mismatched identity). Existing admission locks,
  durable recovery and rollback tests passed unchanged. Worker typecheck and affected ESLint pass;
  independent read-only review found no blocker. Logs: `/tmp/vakhta-schedule-ack-delivery/`.
- Limits: committed eligibility is checked before each send; it can still change after that read.
  Telegram send and the DB commit remain non-atomic. No production employee action or delivery was
  manufactured. Full #7 stays open: snapshot-bound `ack:all`, actor/time/reason history presentation,
  exact metadata publication preview and integrated redesign acceptance remain subsequent work.
- Next: integration owner delivers this bounded worker change through existing CI/release, then
  continues #7 without treating timer admission or queued state as Telegram delivery evidence.

### Main workspace feedback and interface QA — #6

- Aggregate enabled org/list/templates/roster/current-detail queries into one shared QueryFeedback,
  following the existing Overview pattern. Retain failure-specific text/retry and paused feedback;
  cached refresh stays in the header. Disabled dependent queries cannot create an endless loader.
- Missing active templates now use a visible success-gated Alert instead of the ignored Feedback
  notice prop. Create/Continue and Restore derive their availability from the same condition as the
  handler; failed reads cannot leave an apparently working button that silently returns.
- Workspace tests: 32 passed (four additional loading/empty-versus-failure/cached-list regressions).
  Panel TypeScript/React Compiler build and scoped ESLint passed. Independent review found no blocker.
- Captured and inspected desktop/mobile missing-template alerts. A temporary synthetic empty-template
  fetch response was installed only in the agent's preview tab, then removed by reload. No production
  records or user tab were changed. The existing full stored interval remains readable when directory
  template metadata is unavailable.
- Additional browser evidence: context creation inherited 10 September and its zone, employee/template
  selection enabled Apply, Enter applied the local change, keyboard Close worked, switching grouping
  kept the selected date/assignment, and Undo returned Save to zero. Screenshots cover the desktop and
  390px Sheet. Synthetic local draft was discarded after QA. Page width equals viewport width at 390px.
- English week picker and Russian month picker/day list were visually inspected; the picker exposes
  localized month/year and whole weeks or twelve months without day selection respectively. Russian
  390px page width also equals viewport. Ukrainian preview restored after testing. These browser checks
  use synthetic data and keyboard/pointer interaction, not real production personnel or a device pilot.
- Evidence: `context-create.png`, `context-create-mobile.png`, `week-picker-en.png`,
  `month-picker-ru.png`, `day-ru-mobile.png`, `missing-templates.png`, `missing-templates-mobile.png`
  in `docs/engineering/evidence/schedule-ui-2026-09-13/`.
- Lean: one waiting surface and a visible actionable explanation reduce duplicate reading and inert
  clicks. Full #6/#7 acceptance remains open for the outstanding integrated workflow evidence; no
  participant baseline or production cutover is inferred.

### 2026-09-13 — Snapshot-bound acknowledgement (#7, accepted increment)

- Home and monthly Plan previously emitted ack:all, whose handler expanded the target at click time.
  An old Plan can therefore confirm a newer publication or another month. Accepted SC-18/20 scope:
  bind employee/view/assignment snapshot with a stateless digest, compare after version locks and
  write only matched IDs/events in one transaction. Exclude acknowledgement state for repeat taps.
  Legacy unbound buttons refresh only; no policy, Redis token lifecycle or notification-button change.
- Lean: Proceed. Keep one acknowledgement action and remove accidental confirmation/rework; request
  another tap only after the plan changes. Synthetic regression evidence verifies the guardrail;
  no production employee activity or throughput claim.
- Implemented in existing ScheduleService and Telegram owners; callbacks are 50/58 ASCII bytes.
  New 9 service and 7 bot real-DB cases verify stale Home/Plan, exact month, employee/scope/digest
  mismatch, concurrent/repeated taps, lock-wait reread, whole-batch rollback, legacy refresh in all
  locales, malformed callbacks and same-month redraw. Three existing compatibility checks passed
  (publication/acknowledgement, replacement publication, Home rendering). API typecheck, i18n build,
  scoped lint/format and independent read-only review passed. Logs: `/tmp/vakhta-schedule-ack-snapshot/`
  (`tests.log`: 13 passed with 3 legacy mock-arity assertion failures; corrected `legacy-retest.log`:
  3 passed; `compatibility-tests.log`: 3 passed; no service/bot behavior failure remained).
- Lean completion: unchanged plans still take one tap; stale buttons refresh without recording
  acknowledgement. Fixed assignment IDs cannot expand after the final reread. This is snapshot
  equivalence, not signed proof of reading, and Telegram response delivery is not DB-atomic. No live
  employee messages/screenshots were produced; bot texts/keyboards were inspected through synthetic
  transport assertions. Full #7 history/diff and other accepted scope remains open.

### 2026-09-13 — Durable commands (#9) completed checkpoint

Integration owner verified source `0e066554cf0b172152762d0b008758db05f92c7f` through successful
[CI 34724963401](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34724963401), reconciled the
acceptance criteria, and [closed #9](https://github.com/leonidkuznetsov18/vakhta/issues/9#issuecomment-5649387586)
as completed. The command guarantees and bounded concurrent-revocation limitation above remain
unchanged; this checkpoint does not close the surrounding Schedule epic.

Additional #6 browser evidence: an offline network override in the agent's synthetic preview tab
showed one connection-waiting message while retaining the calendar on desktop and 390px mobile.
Restoring the network removed the message. Captured and inspected `schedule-offline.png` and
`schedule-offline-mobile.png`; all network/device overrides were cleared. This exercises cached
offline reading, not production delivery or an offline mutation.
