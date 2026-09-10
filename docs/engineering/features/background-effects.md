# Feature: durable background effects

## Outcome and scope

Approved risk #5 in [critical reliability](critical-reliability.md): persist required effects with
source state and recover after process or Redis failure. The foundation increment is additive schema,
DB helpers and PostgreSQL regression coverage only. Baseline: `2bb08b9`. No producer, dispatcher,
legacy BullMQ job or product interaction is changed in this increment.

## Current behavior and ownership

The [product document](../../features/background-effects.md) describes the intended worker outcome.
`packages/db/src/schema/background-tasks.ts` owns durable intents and operational retry state;
`packages/db/src/background-tasks.ts` exposes the narrow transaction helpers. Tests live in
`apps/worker/src/background-tasks.test.ts` and use the existing PostgreSQL 16 container fixture.
Backend feature modules and the pure domain remain intact; frontend FSD is not applicable here.

The existing API still enqueues BullMQ work after commit and subscribes to business changes in memory.
The existing worker remains its consumer. These integration gaps are explicitly pending.

## Decisions and reuse

Reuse PostgreSQL, Drizzle, existing job identities, concrete job contracts and worker handlers.
A dedicated task table is necessary because `notification_outbox` represents recipient messages,
whereas these jobs may modify business projections and must retain a source-event/target identity.
No additional queue framework or dependency is introduced. DB does not depend on the contracts package.

The envelope has an explicit positive `payloadVersion`, a named kind and a JSON object payload.
This storage-level envelope is not runtime validation of a media/timer/bonus command. A future
producer and consumer must reuse the concrete Zod job contracts in `packages/contracts/src/queues.ts`
and explicitly handle supported versions before invoking a handler. Unknown versions must not be
acknowledged as successful. No consumer or speculative duplicate payload contract ships here.

### Immutable intent

`id`, `kind`, `payloadVersion`, `dedupeKey`, `payload`, `sourceEventId`, `targetSessionId`, `dueAt` and
`createdAt` never change. SQL enforces this even for writes outside the helpers. An enqueue replay
returns the same ID only when all supplied intent fields agree; conflicting intent throws without
replacing the row. JSONB equality ignores object key ordering.

`BONUS_RECALCULATE` requires both an existing source event and target shift. Their pair is unique;
other kinds have neither binding. Two independent source events for one shift remain two jobs.
Historical recovery must reuse a stable original event or one explicit audited recovery event; it
must not create a fresh source key on every sweep. Tasks are retained for deduplication; this increment
does not introduce deletion, retention cleanup or manual task replay.

`dueAt` preserves the business deadline; `availableAt` may move for backoff and never precedes it.
SQL checks the three states, lease/completion field consistency, non-negative monotonically increasing
attempts and safe error classifications. Completed rows cannot be reopened or rewritten.

### Lease and execution contract

- `enqueueBackgroundTask(tx, intent)`: requires a `Transaction`, not the root pool; pass the source
  transaction, never enqueue after its commit. It explicitly copies only intent fields, so structural
  TypeScript extra properties cannot inject IDs, completion, attempts or other operational state.
- `claimBackgroundTasks(db, { kinds, limit, leaseMs })`: a short transaction selects due or expired
  rows with `FOR NO KEY UPDATE SKIP LOCKED`, creates fresh tokens and commits before returning.
  Limits are 1–100 jobs and 1–300,000 ms per lease. Claims never wait for a locked candidate.
- `renewBackgroundTaskLease(db, lease, leaseMs)`: compare-and-set for an unexpired current token.
  It cannot shorten the deadline or revive an expired/completed task. Renew only during external I/O.
- `retryBackgroundTask(db, lease, { delayMs, errorCode })`: compare-and-set for the current unexpired
  owner, scheduling 1–86,400,000 ms of backoff. It stores only an allowlisted classification, not raw
  exception text, tokens, URLs or media content. The caller chooses its bounded backoff policy.
- `runBackgroundTask(db, lease, effect)`: owns one DB transaction. It locks the task, checks the token
  and PostgreSQL wall clock, invokes `effect(tx, task)`, then checks the wall clock again and completes
  the task. Failure or expiry throws and rolls back every effect. Callers must use the supplied `tx`
  for all reads/writes; no network I/O, nested transaction or root-pool query belongs in this callback.

Renew/retry and execution recheck time in a separate statement after acquiring the row lock, so time
spent waiting counts. All lease fences use `clock_timestamp()`, not transaction-start `now()` or a
caller-controlled clock. A token identifies ownership; the lease timestamp returned to a caller is
only a snapshot and is not authoritative. An expired owner cannot complete even before reclamation.

External I/O must finish before `runBackgroundTask`; its result is persisted inside the callback.
Network operations need their own timeout/cancellation and idempotency. A callback failure leaves the
claimed lease unchanged by rollback; the dispatcher records retry separately, or expiry recovers it
if the process dies first. A failed commit acknowledgement may mean completion already committed:
retry must reread state, not force-reset it. These helpers do not create exactly-once external delivery.

### Rollout and rollback

1. Deploy additive migration `0027_background_tasks` without producers/consumers. It adds only its
   table, foreign keys, indexes and guard; no business records are backfilled or rewritten. Existing
   application and BullMQ workers remain compatible.
2. Verify the table, constraints and guard on the deployed database before deploying any consumer.
   Railway worker startup is independent of API migrations, so a consumer-first rollout is unsafe.
3. In later reviewed increments, integrate producers and consumers, then bounded repeated recovery
   sweeps. Preserve the existing delayed BullMQ jobs and handlers while they drain; never purge them.
4. Roll application code back if necessary while retaining the additive table and pending tasks.
   Do not drop durable intents to make a rollback look clean. Schema removal requires separate proof
   that no producers/consumers depend on it and no unresolved work would be lost.

Sources: [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html),
[row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS),
[wall-clock timestamp semantics](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT),
and [Drizzle transactions](https://orm.drizzle.team/docs/transactions).

## Lean review

Proceed. Recon found required timers and bonus recalculation depending on surviving API callbacks;
media and escalation recovery also crossed separate commits. The smallest useful change retains
work without asking employees to repeat photos, checklist actions or requests. This foundation adds
no worker interaction. It does not prove a measured reduction in production downtime or throughput.

After consumer integration, measure commit-to-effect delay, overdue tasks, recovered attempts and
duplicate notifications across restart/retry exercises. Preserve existing deadlines, recorded history,
confirmed scores and closed periods. Escalate unresolved tasks to engineering without blaming workers.
Do not introduce new bot steps or dashboards as part of this reliability correction.

## Verification

2026-09-10, local baseline `2bb08b9`:

- RED: two SQL tests failed because the table did not exist (`42P01`).
- First GREEN: both tests passed after the additive migration and guard.
- Helpers RED: ten behavioral tests failed before the helpers existed; the two SQL tests still passed.
- Helpers GREEN: all twelve tests passed with source rollback, concurrent enqueue/claim, locked-row
  skipping, stale ownership, transactional effects, expiry rollback and bounded retry behavior.
- Extended suite: 23 PostgreSQL tests passed, including independent source-event/target identities,
  raw SQL invariant violations and completed-task immutability. The mid-transaction expiry test
  advances PostgreSQL wall time beyond a future deadline, distinguishing it from transaction time.
- Independent review reproduced an extra-property injection through the original input spread:
  one new regression failed / 23 passed. Enqueue now explicitly copies intent columns and requires
  a `Transaction`; the regression and compile-time boundary assertion protect both fixes.
- Final focused suite: 25 tests passed; worker typecheck passed. `pnpm build` passed all eight
  tasks (five cached; DB, API and worker rebuilt).
- An ephemeral PostgreSQL 18 container passed the complete migration chain, enqueue deduplication,
  expired lease recovery, stale-failure fencing and transactional result/completion smoke checks.
- Final `pnpm check` passed: 469 tests across packages; API 216 and worker 48 executed fresh,
  while domain 136, panel 55, contracts 4 and i18n 10 were cached. Typecheck, lint and format passed.
- Both independent read-only reviewers approved the final helper boundary and regression source;
  no blocking findings remain. Reviewed helper SHA-256:
  `2d10aeaec5fae11163700fef657a6aa39748541bfae9628d8893ef8a205a4c50`.
  Reviewed migration SHA-256:
  `28a9b680adedadeced64bc0d8d9067bb96110bf1528902fb0601f4c07e3b62ea`.

This increment has no UI, kiosk, bot handler, production producer or production consumer change.
Authenticated deployment checks are performed by the integration owner after rollout; local database
tests are not production or browser verification. No production data was mutated during implementation.

## Remaining work

Integrate source-transaction producers; typed/versioned dispatchers; atomic handler effects and task
completion; legacy BullMQ draining; bounded deadline-based recovery; durable bonus invalidations and
session/period concurrency guards; monthly startup catch-up. The task table alone does not close risk #5.
Preserve #2/#3 transaction guarantees and #8 persisted plans/deadlines during subsequent integration.

Later producer integration must also cover BonusService's post-commit adjustment/review/second-approval
recalculations, not only RxJS subscribers. Second approval currently needs an explicit durable source
event. Historical acknowledgement recovery must check relevant pending business state: scanning all
old published months would create notifications unrelated to current work. Preserve the original
publication-derived deadline and existing notification deduplication keys.
