# Implementation Plan: Schedule calendar redesign

**Change**: 002-schedule-calendar-redesign | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)
**Baseline**: f66cafc7f78b84d7482bb7ec8d19eaa09c947a91 | **Checkout**: master
**Engineering memory**: [Schedule redesign](../../docs/engineering/features/schedule-calendar-redesign.md)

## Summary

Implement the full epic in one task through bounded sequential deliveries, keeping one scheduling
writer and one set of domain rules. Preserve the functioning slice and services. A controlled calendar
renderer consumes prepared models and emits intents; scheduling owns validation, drafts and writes.
Each dependent stream refines its contract here before implementation after its policy gate resolves.

## Technical Context

React 19, Vite 7, React Compiler, TanStack Query 5, Table 9.2.4, Zustand 5, date-fns 4, shadcn and
existing trilingual catalogs. Nest/Fastify scheduling module, Drizzle/PostgreSQL, pure domain package,
existing durable worker notification/timer infrastructure. No calendar library or virtualizer installed.
See [component research](research.md) for current official capabilities/licenses and prototype gates.

## Constitution Check

Preserve attendance FSM, historical assignment instants/identity and append-only evidence. Frontend
state remains in Query (remote), scoped Zustand drafts (local) and existing navigation/view ownership.
No application effect/ref/memo/callback hooks, forwarding class workaround or peer-feature imports.
Inputs/outputs use Zod. All display strings use three catalogs. High-risk boundaries receive focused
invariant checks and one independent reviewer; no duplicate full local CI. One writer/index owner.
Only unresolved domain policies gate dependent behavior; the owner authorized independent stages.

## DESIGN: Ownership and Behavior

### Rendering and navigation

Use a controlled domain-independent resource calendar built from installed shadcn/Table primitives
unless the prototype demonstrates an unsolved need. `shared/ui/resource-calendar/index.ts` exports
readonly resource/date/item view types and one renderer. Prepared labels, semantic status, disabled
reasons, selection and callbacks enter through props; no Workspace/API DTO/query/mutation enters it.
Feature `model/calendar.ts` adapts existing complete grids and stored instants. Feature UI composes
AssignmentEditor in a responsive Sheet, BatchPlanner, PublicationReview and ScheduleHistory. Preserve employee-matrix
monthly editing and its Sheet; month is always people grouped by explicit owner correction; no parallel authoritative data state.

Grouping and period are independent. Mobile defaults to a selected-day list with a seven-date strip;
desktop shows resource rows/date columns and a paginated complete count. People and zones use the
same assignment IDs; empty active zones remain visible. Exact intervals, next-day dates and duration
labels are prepared outside JSX. All essential actions have keyboard/touch equivalents. Drag later
emits the same move intent as explicit Move; it does not apply unvalidated changes.

### Complete reads and reliable commands

Keep filtered/paginated rendering separate from complete month draft serialization. Add complete
scope-aware roster retrieval and validated page totals; abort obsolete requests. Add monotonic version
revision and command receipts in scheduling schema. Client commands carry expected revision and
stable logical identity; save/revise/transition checks occur under transaction locks before mutation.
Persist command intent for uncertain outcomes; explicit retry resolves the same receipt. Scope/actor
checks run for new commands and receipt reads. No automatic mutation retries or stale overwrite.

Server detail/version revision must describe one consistent snapshot. All writers, including Requests,
must increment affected revisions. Authorization is rechecked at commit rather than assuming a
controller preview grant persists. Receipt identity binds actor, command type, target and payload;
reusing identity with different intent is rejected. Preserve newer local edits on older completion.

Cross-month reads aggregate the required monthly snapshots, including adjacent rule context. A
multi-version action lists every expected revision; deterministic lock order and one transaction
cover validation, versions, request decision, audit and notification intent. D-05 defines review
ownership before this write boundary is enabled. The calendar cannot promise saves it cannot commit.

### Rules, staffing and human decisions

Demand, qualifications and rule configuration are dated, owned and audited. Pure domain functions
evaluate complete proposed intervals and role coverage, distinct people, absences, preferences and
configured thresholds, returning stable eligible/warning/blocked/unknown reasons. Mandatory constraints
precede ranking. Database concurrency serialization covers employee/time across units, not merely one
month/version lock. Source and destination scope/coverage are rechecked for borrowing.

Internal slots, published offers, interest and final allocation have distinct identities and states;
selection is transactional and uses the existing human approval route. Slot interest never assigns.
Requests keeps swap/absence approval ownership; page/widget composition uses public feature APIs.
No medical attachments enter calendar projections. Delivery uses existing durable effects only.

### Time, records, proposals and extensions

Parent assignment identity stays stable for segments. Additive migrations retain stored instants and
attendance links. Segment/break changes preview hidden parts and preserve omitted collections unless
an explicit full replacement is selected. D-04 fixes gap/break and custom-time semantics before code.
Audit every attendance/reminder/report consumer before enabling custom intervals; gate old writers
when they cannot preserve new data. Recovery disables new admission, never downgrades history.

Notes/typed fields have explicit audiences and versioned definitions; preserve recorded values.
Print/export is an authorized complete projection with timezone, version, creation time, units and
formula-safe cells. Personal feed tokens are revocable, hashed and omitted from logs; event identity
survives updates. Allocation proposals operate on real slots with explainable diffs and unresolved
reasons, revalidate at commit and never self-publish. D-07 extensions receive concrete bounded
contracts only after actual systems/data/accountable owners are supplied.

## Project Structure and Allowed Files

Writer/index owner: this Schedule task (01a09769-91c2-7490-a16f-29d7e2b6a44f). Previous writers released
ownership; their changes are committed in f66cafc. Recheck status before every write/Git turn.

- `apps/admin-web/src/features/schedule-management/{api,model,ui}` and deliberate public `index.ts`.
- `apps/admin-web/src/shared/ui/resource-calendar/`, existing app/page composition only when needed.
- `apps/admin-web/src/preview/schedule-fixtures.ts`, `apps/admin-web/src/preview.tsx` for isolated QA.
- `apps/api/src/scheduling/`, affected `requests/`, attendance/reminder consumers only for named cases.
- `packages/contracts/src/scheduling.ts`, public exports; `packages/domain/src/scheduling/` and exports.
- `packages/db/src/schema/scheduling.ts`, additive generated migrations and schema export.
- Relevant `apps/worker/src/` consumers and `packages/i18n/src/` catalogs.
- This spec directory, existing Schedule product/engineering documents, component ADR and rollout runbook.

## Lean Review

Proceed and simplify: contextual standard planning, one clear action, readable day team, recoverable
batch changes. No added segment check-ins, invented scores or mandatory custom fields. Record baseline
and pilot with real planner/day/night masters; automated timings are only technical fixture evidence.

## IMPLEMENT: Ordered Delivery

1. #4 policies/baseline and #54 acceptance/runbook start; independent #5 controlled-renderer prototype.
2. #6 calendar workspace, then #7 existing journeys and #9 draft/roster safeguards; no new master rights.
3. #8 authority after D-01; #10 cross-month after D-05; #11 staffing after D-02.
4. #12 common eligibility after D-03/#10/#11; #13 slots/offers after D-06/#7/#12.
5. #14 patterns/batch/moves; #15 custom time/segments after D-04; #16 workload/relief.
6. #17 Requests/operations integration, then #18 records/output and #19 feed/proposals.
7. #20 accepted individual extensions only after D-07 contracts. Keep unresolved scope visibly open.
8. #54 integrated acceptance, rollout, participant pilot and explicit go/hold. Close epic only when done.

Each stream's task checks update tasks.md, acceptance.md and the existing engineering memory. Refine
policy-dependent detailed schemas/contracts before writing; do not invent them to close planning.
Converge runs after implementation to append demonstrated gaps while retaining existing tasks.

## VERIFY and HARDEN

- UI/model: `pnpm --filter admin-web test src/features/schedule-management` plus renderer tests;
  `pnpm --filter admin-web typecheck`, affected ESLint and app build when bundling changes.
- Contracts/domain/i18n: focused package tests, affected type checks and builds for exported additions.
- Scheduling: `pnpm --filter api test src/scheduling/schedule.service.test.ts`; add named real-DB
  concurrency/rollback/receipt/authorization regressions. Run affected Requests/worker tests when changed.
- Visual fixture: desktop 1440x900 and 390x844, uk/en/ru, long data, empty zones, selected details,
  edit/publication, errors/recovery; inspect captures, horizontal overflow and keyboard behavior.
- Large fixture: use 500 employees/20 zones/14 days for renderer measurement, with a separate 5000-item
  command cap. Record mode/browser/DOM/timing and scrolling; this is a technical test, not a human pilot.
- Independent fixed-diff reviewer for high-risk writes; reuse passed evidence unless inputs changed.
- `acceptance.md` maps all SC/AC/UX plus twelve scenarios to tests/screenshots/pilot and current state.
- One coherent master push per reviewable completed concern; inspect actual CI, release, announcement
  and affected deployment separately. No manual duplicate Telegram messages or production worker actions.

## REPORT and Documentation

Update existing feature memory per stage, including exact command outcomes, decisions, limitations
and next task. Update existing GitHub issues with spec links/status/evidence without replacing their
original acceptance. Close only after all required evidence. Product guide describes shipped behavior;
planned capability status stays explicit. #54 runbook records compatible writers, migration checks,
history-preserving recovery, pilot inputs and go/hold decision.

## Open Decisions

D-01–07 are tracked in spec.md. None is implicitly accepted by this plan. Human baseline/participant
pilot and production unit selection remain external evidence requirements. Component choice requires
runtime spike evidence; preliminary source recommendation does not claim verified behavior.
