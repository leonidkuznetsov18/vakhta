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
Deployment verification remains pending; no real worker record was changed for this check.

## Remaining work

Complete the full #5 durable scheduling path. This slice does not claim recovery of a job that never
reached the processor, or exactly-once delivery across PostgreSQL, Telegram and S3. Production QA
must use existing evidence or isolated fixtures, not fabricate worker handover records.
