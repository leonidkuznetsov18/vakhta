# Schedule calendar rollout and recovery

Status: Version 2 (2026-09-13). Implementation children closed; production pilot on HOLD until the owner selects and authorizes a unit.
Owner: Schedule epic #1 / integrated acceptance #54.
Evidence: [acceptance matrix](../../specs/002-schedule-calendar-redesign/acceptance.md).

## Current boundary

The redesigned calendar is the working editor for a unit month: one working plan per role, in-place
edits, chained submit/publish, zone-scoped masters, staffing and eligibility rules, custom time,
segments, breaks and relief, open slots with offers, operational context, notes, reports, print,
export, the personal feed and allocation proposals. The month version model, publication, review,
acknowledgement, history, reminders and bot paths are unchanged owners. A synthetic preview never
authorizes production employee actions or replaces the participant baseline.

### Authoritative writer and compatible surfaces

- One writer: `ScheduleService` through the durable command route (`/admin/schedules/commands`)
  and the legacy PUT/revise routes, all under version row locks and revision preconditions; slot
  selection and request effects write through the same service. No second scheduling writer exists.
- Schema changes since v1 are additive: migrations 0041–0048 (staffing, rules, availability,
  patterns, custom time and segments, breaks, open slots and offers, notes, feed tokens). Existing
  rows keep meaning; new columns are nullable or defaulted; nothing rewrites history or events.
- Old clients: a panel revision that predates custom time, segments or breaks would resend an
  assignment without them and silently drop that data. The API therefore requires the current
  panel: keep API and panel deployed from the same release; if the panel must be rolled back to a
  pre-0044 revision, make Schedule read-only (deploy the API with `SCHEDULE_EDIT_ROLES` grants
  withheld) until the panel is restored. Do not run mixed revisions for editing.
- Bot: new buttons (calendar link, slot offers) are additive; an older bot revision ignores them.

### Migration and backfill checks before cutover

1. `pnpm --filter @vakhta/db build` and apply migrations in order; verify `assignment_segments`,
   `assignment_breaks`, `open_slots`, `schedule_notes`, `calendar_feed_tokens` exist and are empty
   or as expected.
2. Run the API real-DB scheduling suite against the target database engine version.
3. Confirm published versions, acknowledgements and attendance links are unchanged by counting rows
   before and after (no migration touches them).

### Capability gates

Hold the affected capability, not the release, when any of these fail: unauthorized change (scope
tests), false sufficient coverage (unknown must never show as covered), invalid assignment saved
(eligibility at commit), hidden partial save (full-month writes only), missed effective-change
communication (publication outbox rows), history loss (append-only events and audit). Remedy and
owner are recorded in the feature engineering memory.

## Before a production pilot

1. Record D-01–07 answers and the supported SC/AC/UX scope in the canonical spec. Keep unsupported
   capabilities visible as open issues. Record the selected unit, pilot participants and owner.
2. Complete the relevant child evidence, including stale/concurrent/uncertain write recovery before
   introducing coordinated or additional writers. Record old/new client compatibility and migration
   lineage for every additive schema change; this first renderer increment has none.
3. Reuse CI evidence for the exact delivered revision. Record release, announcement job and deployed
   frontend/API/worker revisions. Do not equate a successful build with a deployed version.
4. Capture and inspect changed desktop/mobile views in uk/en/ru and affected Telegram messages.
   Use the authorized QA account/session. Synthetic actions stay in the preview or test environment.
5. Run the twelve matrix scenarios with agreed participants, comparing the same baseline tasks.
   Record timing, errors, recovery and unresolved friction without invented numerical targets.

## Recovery ownership

Keep unsaved draft content when a request fails. A renderer failure must not change server versions,
acknowledgements or attendance. Preserve the affected local draft before returning to an earlier
frontend revision; do not clear browser storage as a generic repair. Investigate uncertain writes
against the authoritative server revision/receipt once #9 provides that protocol; until then, do not
claim automatic reconciliation or safe blind retries. Existing mutations have automatic retry off.

Use the established platform runbook to restore a previously verified frontend deployment if needed.
Record the actual revision and incident. Future backend/migration increments must extend this runbook
with verified compatibility and recovery steps before their cutover; this document does not authorize
a destructive migration rollback or history rewrite.

## Go / hold record

2026-09-13: D-01–07 recorded; children #5–#19 delivered with evidence; #20 deferred by decision.
**HOLD on the production pilot**: no participant comparison against the #4 baseline has been run
and no unit is authorized. The next step is the owner's: select a unit and participants, run the
synthetic planning/replacement/recovery tasks with a planner and day/night masters, record task
time, contacts, corrections and assistance, then decide go/hold. Until then the old editor is
retired in the panel (the redesigned calendar is the only editor) and every release keeps API and
panel revisions together. When the old editor is safe: never for editing alongside the new one;
read-only history remains through the version history views.
