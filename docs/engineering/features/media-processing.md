# Feature: media processing reliability

## Outcome and scope

Critical reliability #5, first vertical slice. Baseline `a9be981`. Prevent a database failure from
leaving a photo marked processed without its required completion event. Preserve retryable input
and avoid creating a second storage object solely because retry happened in another month.
Product contract: [reliable media processing](../../features/media-processing.md).

## Current behavior and ownership

`apps/worker/src/media/process.ts` owns the existing Telegram download, S3 upload, image analysis,
media projection and `MEDIA_PROCESSED` event. UI consumes the existing media status; no new worker
menu, component or contract is introduced. Existing quality and duplicate-detection rules remain.

## Decisions and reuse

- Reuse Drizzle transactions, existing media IDs and unique event idempotency keys. No dependency
  or migration is needed for this slice.
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
- Cross-object concurrent duplicate detection is unchanged. Durable task admission, recovery sweeps,
  missing-configuration retries and bonus invalidation remain the next #5 increments.

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

Complete the full #5 durable scheduling path. This slice does not claim recovery of a job that never
reached the processor, or exactly-once delivery across PostgreSQL, Telegram and S3. Production QA
must use existing evidence or isolated fixtures, not fabricate worker handover records.
