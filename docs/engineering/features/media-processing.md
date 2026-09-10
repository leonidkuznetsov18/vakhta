# Feature: media processing reliability

## Outcome and scope

Critical reliability #5, incremental delivery. The first atomic-processing slice used baseline
`a9be981`; durable media integration builds on foundation `f9a437c` (plus docs `05a0416`). Prevent a database failure from
leaving a photo marked processed without its required completion event. Preserve retryable input
and avoid creating a second storage object solely because retry happened in another month.
Product contract: [reliable media processing](../../features/media-processing.md).

## Current behavior and ownership

`apps/api/src/handover/media.service.ts` admits media and its task atomically.
`apps/worker/src/media/process.ts` splits read-only/I/O preparation from transaction-owned finalization;
`media/tasks.ts` owns PostgreSQL dispatch/recovery and `media/runner.ts` owns startup, periodic work
and shutdown. The existing BullMQ wrapper shares the same preparation/finalizer. UI consumes the existing media status; no new worker
menu, component or contract is introduced. Existing quality and duplicate-detection rules remain.

## Decisions and reuse

- Reuse Drizzle transactions, existing media IDs and unique event idempotency keys. Durable admission
  uses the separately deployed additive task foundation; this integration adds no migration or dependency.
- Download and upload outside the database transaction. Lock the current media row with
  NO KEY UPDATE afterwards; re-read completion under the lock, then persist projection and event
  atomically. Concurrent retries cannot overwrite the committed winner's metadata.
- New keys use the immutable received month and media ID. Completed legacy keys stay unchanged.
  S3 cannot roll back with PostgreSQL: a failed attempt may leave the same private object ready for
  retry. Multiple PUT calls are possible; no exactly-once network guarantee is claimed.
- Existing completed rows repair a missing event under the same mutex using persisted metadata
  and original processedAt. Repair does not alter projection, retention, attempts or diagnostic data.
- Failed attempts increment diagnostics atomically only while incomplete, so a delayed failure
  cannot overwrite successful completion. A failure remains rejected to the existing retry caller.
- Cross-object concurrent duplicate detection is unchanged. Timer and broader bonus integration
  remain subsequent #5 increments; media admission/recovery now use the contract below.

Sources consulted: [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html),
[Drizzle transactions](https://orm.drizzle.team/docs/transactions),
[Amazon S3 object storage](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html).

## Lean review

Proceed: independent PostgreSQL regressions demonstrate partial completion and repeat storage keys.
The change removes avoidable resubmission and recovery work without adding a worker interaction.
Observe processing backlog age, retries and missing completion events. A successful retry must keep
one stable object key and one completion event; failed attempts must never punish the worker.

## Verification

2026-09-10: independent real-PostgreSQL tests reproduced all three defects on baseline (4 existing
cases passed, 3 new cases failed). After the correction, all seven passed freshly. An additional
concurrency regression checks a delayed failing attempt against an already completed winner.
All eight media regressions passed freshly, including the delayed losing attempt. `pnpm build`
passed (2 fresh / 6 cached tasks); `pnpm check` passed 444 tests (23 worker tests fresh, 421 cached),
typecheck, lint and formatting. Independent final-diff review approved with no blocking findings.
Deployment verification: CI `34477914924` and release v0.70.8 succeeded, including images, actual
Pages uploads and the existing announcement. Railway worker deployment
`dabc6453-849f-4bb3-a389-35d8925995b5` reports SUCCESS at `2bb08b9`. A read-only database check found
57 media rows, zero pending rows and zero processed rows missing their completion event. A capped
ten-record error-level worker-log query since 12:49 UTC returned no records.

Authenticated panel v0.70.8 loaded the handover list and existing photo counts on desktop and 390x844
mobile. The API's current bot home and paired kiosk had just passed verification at `a9be981`; this
worker-only change did not redeploy the API. No real worker record or photo was created for QA.
Failure/retry uploads used isolated PostgreSQL and fake I/O fixtures; existing production rows alone
do not demonstrate the new failure path. Viewport overrides were reset.

## Remaining work

Complete remaining timer producers, bonus sources/consumer and broader #5 recovery. Durable media
admission now recovers jobs that never reached the old processor. It does not offer exactly-once
delivery across PostgreSQL, Telegram and S3. Production QA
must use existing evidence or isolated fixtures, not fabricate worker handover records.

## Durable media contract

- `MediaService.register` requires a `Transaction` and persists `media.<id>` with the original
  `receivedAt`, including unprocessed legacy rows and processed attachment replays. The API no longer
  constructs a BullMQ media producer or depends on an after-commit media enqueue callback.
- Dispatch accepts only `MEDIA_PROCESS` version 1, the existing `MediaJob` Zod payload, and a matching
  canonical task key. Missing dependencies and invalid input/version stay retryable with safe error
  classifications. They never become completed media work.
- Preparation has no database writes. Default I/O timeout is 60 seconds within a 120-second lease;
  `Promise.race` rejects the complete path even if an adapter is slow to observe abort. Native download
  fetch and S3 receive the abort signal. Installed grammY 1.46 has a polyfill signal type, so getFile
  uses its supported 60-second SDK timeout without an unsafe cast or extra dependency. It cannot be
  synchronously canceled by the native signal; an explicit post-getFile check prevents later phases.
  Signal checks also precede upload after non-abortable image analysis. A late same-key network PUT
  may finish, but timed-out/lost-lease preparation never publishes a projection.
- `runBackgroundTask` owns the final DB-only transaction: media row mutex, winner recheck, projection,
  stable `MEDIA_PROCESSED` event, per-source-event/target bonus tasks and task completion. No nested
  transaction or root-pool query occurs there. Expiry/failure rolls all these writes back.
- Bonus mapping covers checklist-photo quality via `handoverMedia -> handoverRecords`, the actual
  input consumed by legacy scoring. No new medical/incident-photo scoring semantics are introduced.
  `bonus:<eventId>:<sessionId>` retains the existing event's `occurredAt`. Existing events can repair
  missing target tasks without creating another completion event. The API score consumer is pending;
  this increment persists intent and does not claim a newly recomputed score.
- Each process claims at most two media tasks per default poll. It waits for all attempts to settle,
  so a persistence failure cannot leave an untracked parallel callback while another batch starts.
  Startup runs immediately, polls every second, and repeats bounded recovery every minute. Shutdown
  stops new polls and awaits the current batch. Independent processes coordinate through DB leases.
- Recovery anti-joins admit at most 100 pending or processed/event-gap legacy media rows per pass;
  existing pending/running tasks retain identity. A separate bounded anti-join repairs missing bonus
  targets for existing media events. No timestamp cursor skips late commits with older receipt times.
  Contradictory completed-task/missing-projection-or-event state is counted as an invariant diagnostic;
  immutable completed tasks are not reopened and no invented repair identity is introduced.
- Legacy BullMQ media jobs keep draining through the shared processor, with bounded preparation and
  atomic finalization. Missing credentials reject the job. Legacy failure diagnostics store a safe
  classification; runtime logs/Sentry receive no raw URL, token or query payload.

## Durable integration verification

Local RED: API admission had two failed cases/one passing rollback case before tasks were persisted.
After integration, admission/replay cases passed. The dispatcher suite initially could not load the
not-yet-created module; this is missing-implementation evidence, not a reproduced production crash.
Subsequent PostgreSQL regressions cover interrupted claims, missing dependencies, overlapping legacy
and PG attempts, lease loss during I/O, full-path timeout/late fetch, event repair, source-event bonus
admission failure/rollback, stable bonus repair, startup/shutdown and bounded late-commit recovery.
The eight pre-existing media processing regressions remained green after the prepare/finalize split.

Final affected suites passed freshly: 40 API tests and 18 worker tests. The complete build passed
eight tasks (three fresh, five cached). The first full check passed all 483 tests (API 220 and worker
58 fresh; domain 136, panel 55, contracts 4 and i18n 10 cached), typecheck and lint, then identified
formatting in one API test. Prettier corrected that file without a behavior change; the final
`pnpm check` passed all 483 tests (API 220 fresh, 263 cached), typecheck, lint and formatting.
Both independent read-only reviewers approved the frozen production
sources with no blockers: one reviewed I/O, leases, atomic finalization and recovery, the other API
admission, actual bonus input mapping and documentation. No new dependency or migration was needed.

## Durable consumer deployment

CI `34482489884` succeeded for `e17b431`, publishing v0.70.10. Railway API
`d25dcba8-9344-40e7-9a9e-b05e636ba3e7` and worker `d75f8487-0c66-49e8-b464-e517eecb2888`
reported SUCCESS at that source. API health was good at 13:38:20 UTC on 2026-09-10. Capped ten-record
API and worker error-level queries since 13:35 UTC returned no rows; this is bounded evidence.

Startup recovery admitted 39 missing media-event/target bonus intents, leaving zero missing targets.
Those tasks remained PENDING with zero attempts because the bonus consumer is a later increment.
All 57 media records then had completed projections and completion events. Subsequent organic traffic
created one durable media task at 13:48:51.969 UTC and completed it at 13:48:53.401 UTC in one attempt;
read-only joins matched its media record, processed storage projection and one completion event.

Authenticated panel v0.70.10 loaded handovers and an existing photo gallery on desktop and at
390 by 844 pixels. A fresh worker-bot `/help` at 16:36 local time returned the help text, PDF and
button; its narrow layout was readable. The paired kiosk showed terminal Main (Основний), advancing
connection time and QR countdown. Device emulation was cleared and the owned kiosk tab closed.
No production photo, shift, checklist or employee record was fabricated for these checks.
