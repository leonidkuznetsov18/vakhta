# Schedule calendar rollout and recovery

Status: Draft; no production pilot or full-epic go decision has occurred.
Owner: Schedule epic #1 / integrated acceptance #54.
Evidence: [acceptance matrix](../../specs/002-schedule-calendar-redesign/acceptance.md).

## Current boundary

The first increment changes day/week rendering and uses existing monthly version commands. It has
no schema migration, new actor rights or notification path. Month editing and existing publication,
review, acknowledgement and history owners remain in place. A synthetic preview does not authorize
production employee actions or satisfy the participant baseline.

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

Hold for full epic acceptance. D-01–07, child implementation/evidence, participant comparison and a
selected-unit pilot remain incomplete. Record each actual increment separately in the existing feature
engineering memory. Close #54 and the parent only after the agreed complete scope is demonstrated.
