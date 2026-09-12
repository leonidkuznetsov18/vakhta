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

#### First bounded increment: complete directory reads

Add an additive `/admin/employees/page` endpoint under the same explicit directory read roles as
`/admin/employees`; this does not expand existing organizational authority or change assignment
eligibility. A UUID cursor, validated page size (maximum 200), deterministic ID order and an exact
total replace the accidental first-200 ceiling for Schedule. Each page and count use one repeatable
read snapshot. Existing directory clients keep their current response contract. Schedule aggregates
validated pages with the Query AbortSignal; duplicate/non-progressing pages or a changing total fail
visibly instead of exposing a partial roster as complete. Saved assignments still provide missing
historical identities. Roster pagination never trims full-month writes. Local display pagination and
search operate on the completed roster. Tests cover 205 employees, cursor completion, malformed/
changing pages, cancellation, and existing permissions. Revision/receipt work remains the next
bounded increment within #9 and is not satisfied by this read fix.

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

#### Second bounded increment: stale-write preconditions

Expose a positive monotonic revision on each version, initialized for existing rows. A database
update trigger advances it for all version writers, including request-driven publication. Every
public mutation of an existing version supplies a required expected revision; compare it after
locking the version inside the mutation transaction, before replacing assignments or changing
status. Delete locks before checking as well. Revision-free internal workflows retain their own
transaction/state guards and still advance the database revision. Detail reads use one repeatable
snapshot so a revision cannot label assignments from a different instant.

Persist the revision with each local draft baseline. A refresh cannot silently rebind an older
draft to a newer revision; legacy drafts without a revision require explicit recovery/review.
On a conflict preserve the local grid, refresh server details, and show localized stale guidance.
Missing public preconditions fail closed, so an older panel must reload before writing. Tests cover
two concurrent editors, lifecycle/delete stale checks, all-writer increments and draft retention.
HR deletion also locks affected parent versions and advances revisions for the actual deleted
assignment set. During rolling deployment, a missing revision is a read-only client compatibility
state (sentinel 0, never accepted by mutation contracts), with localized guidance; old API reads
remain visible while writes wait for the new API.

Idempotency receipts and session-isolated uncertain intents remain the next increment; a revision
conflict alone is not proof that a timed-out command failed or succeeded.

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

### Actor-owned recovery increment (#9)

Persist new drafts under actor/site/unit/month/version keys. Retain unscoped legacy bytes without
attributing them to the next signed-in user; display a recovery notice without exposing their content.
Namespace Schedule reads by actor and current grants, remount the feature on identity/access changes,
and ignore mutation callbacks whose original query instance is no longer observed. Keep complete-month
payloads and revision preconditions unchanged. Verify account changes, scoped draft restoration,
legacy isolation and late responses in the existing workspace regression suite. This does not implement
command receipts or claim isolation from a person with direct access to browser storage.

### Durable command outcome increment (#9)

Use the existing idempotency table with an additive `POST /admin/schedules/commands` boundary.
Validated command identity binds actor, action, target, expected revision and payload. Serialize equal
IDs, replay authorized receipts before live-version lookup, and commit the receipt with every change,
audit/event, outbox and timer intent. New existing-version commands acquire the version lock before
refreshing grants; revision follows authorization. This is transaction-time authorization, not
serialization of simultaneous permission revocation with final commit. Internal Requests keeps its
own transaction. Existing revision endpoints remain compatible; the updated panel never falls back
to them for a command with an uncertain outcome.

Persist exact validated intent under actor/site/unit/month before dispatch; storage failure prevents
dispatch. Unknown transport/5xx outcomes retain the identity, payload and edits across reload. Only
an explicit retry resolves that same logical command. Block new writes for its scope until a receipt
or authoritative rejection arrives; never infer success from a refreshed schedule. Refetch current
state after receipt, preserve newer local edits and newer cached revisions, and ignore callbacks from
obsolete workspace generations. Use existing Zustand/Query ownership with a feature-local queue;
its synchronous storage-before-dispatch order is required because ordinary persist middleware writes
after the in-memory update. Verify lost-success/reload, duplicate taps, rejected stale writes,
identity mismatches, storage failure and scoped recovery. Preview fixtures stay synthetic.

Serialize local admission/completion/retry lookup across live tabs with the browser Web Locks API,
re-reading and validating the shared map inside the exclusive callback. Fail closed if locking is
unavailable; no lockless read-modify-write fallback. Locks cover storage updates; durable server
receipts serialize duplicate command execution. See the [Web Locks specification](https://w3c.github.io/web-locks/).

### Acknowledgement reminder delivery increment (#7, SC-18/20, AC-10)

Accepted scope: revalidate only `ACK_REMINDER` immediately before each relay send/retry. A reminder
is applicable only to its encoded employee and still-published version with a future PLANNED,
unacknowledged assignment. Reuse the existing admission predicate and current notification owner;
automatic and manual dedupe-key formats remain compatible. Invalid keys or recipient mismatch are
skipped, and the message is reconstructed with the validated version-specific acknowledgement.
Keep admission locks and durable outbox retry/status behavior. Do not add version locks after relay
outbox locks; this checks committed eligibility before sending, not atomic Telegram delivery.
Non-goals: `ack:all`, publication notifications, acknowledgement policy, manual admission workflow,
UI/history changes, schemas/migrations, and stronger concurrency promises across Telegram/DB.
Verify real-DB queued-then-superseded, queued-then-acknowledged, retry after acknowledgement,
manual/automatic live delivery, invalid provenance, and exhausted future assignment cases. Reuse
existing reminder admission/locking tests. No employee messages or screenshots are required because
this changes delivery eligibility only, not visible wording/layout.

### Workspace feedback hardening (#6)

Aggregate the main workspace's enabled directory/list/template/detail queries through the existing
QueryFeedback primitive (same pattern as Overview). One loading/offline/error surface keeps cached
content readable and preserves each error's retry target/message. Dialog-owned queries remain local.
Show missing templates only after a successful empty response. Derive create/continue and legacy
restore availability once for both handlers and buttons. Verify initial concurrent loads, successful
empty versus failed templates, and cached list failure with unchanged local intent. No business
policy or period ownership change. Lean: remove duplicate waiting indicators and inert actions.

### Snapshot-bound acknowledgement increment (#7, SC-18/20)

Accepted scope: bind the Home aggregate and exact-month Plan acknowledgement button to employee,
view scope, and the rendered published PLANNED assignment identities/intervals/zones. Use a canonical
SHA-256 base64url fingerprint in a callback below [Telegram's 64-byte limit](https://core.telegram.org/bots/api#inlinekeyboardbutton); exclude acknowledgement
state so repeated taps remain idempotent. Build Plan and fingerprint from the same database rows.
On callback, lock candidate versions in stable order, reread and compare inside the acknowledgement
transaction, then insert only those fixed assignment IDs and append events atomically. Changed
snapshots refresh the same view without acknowledgement. Legacy ack:all cannot recover its original
snapshot and becomes localized refresh-only; version-specific notification buttons stay compatible.
No Redis snapshot storage/expiry, migrations, acknowledgement transfer, future-only admission,
publication audience or new business policy. Required evidence: real DB stale/new-publication,
month isolation, repeat/concurrent taps, employee/scope mismatch, lock-wait change and rollback;
bot legacy/new callback routing, localized feedback and callback byte size. Independent review.

### Scoped version decision history (#7, SC-19)

Accepted backend scope: add GET /admin/schedules/:id/history with the existing detail role and
site/unit authorization before reading audit rows. Use a dedicated ScheduleHistoryService and narrow
validated shared DTO; page/pageSize follows the existing photo-library bounds/defaults. A read-only
repeatable-read transaction returns count/page ordered by at DESC, id DESC. Allowlist only existing
schedule-version create/save/submit/return/publish/remind audit actions for the exact version object.
Preserve every decision reason; never replace repeated returns with current version summary.
Expose recorded actor type/id and current nullable WEB_USER email or EMPLOYEE name; never infer
names for another actor type. Project only typed status/count/based-on fields, not raw JSON/IP/trace.
Same-scope/month supersession lineage is separate from audit entries. No generic audit access,
mutation, migration, notification policy or frontend change. Validate real-DB repeated reasons,
actor collisions/missing identities, stable pagination and omitted unrelated/sensitive data; test
HTTP authentication, role/unit scope, invalid ID/query and narrow response. Independent review.

### Metadata-only publication changes (#7, SC-08/09)

Accepted backend/domain scope: SAVE/REVISE already persist kind/teamId/positionId, but publication's
PlannedShift adapter drops them and sameShift therefore omits an affected employee. Add compatible
optional metadata to PlannedShift; absent kind means REGULAR and absent team/position means null.
Populate both ScheduleService adapters and compare these fields in the existing shared diff, keeping
employee/business-date matching and excluding regenerated assignment/version IDs from equivalence.
Preserve publication transaction, audience selection, outbox dedupe and notification wording. No
new policy, contract migration, acknowledgement transfer or frontend changes. Verify each metadata
field in pure diff tests plus absent/default equivalence, and real-DB SAVE/publish and REVISE where
only the affected linked employee receives exactly one change notification. Independent review.
