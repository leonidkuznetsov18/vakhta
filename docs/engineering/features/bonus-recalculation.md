# Feature: durable bonus recalculation

## Outcome and scope

Approved remaining critical risk #5 after durable media and timers. This document records the design;
implementation and deployment are pending. Preserve existing scoring criteria, compatibility APIs,
confirmed scores, period bases and immutable monthly nominations. The current product panel remains
the read-only ledger described in [bonus points](../../features/09-bonus.md).

## Current behavior and ownership

`BonusService.onModuleInit` depends on in-process change subscriptions; failed recalculation is only
logged. Manual score changes also recalculate after committing. `EventStore` records source events,
and the deployed background-task helpers already support source-event/target-session identities.
Media processing now admits these intents, but the API consumer does not yet exist.

`closePeriod` and `reopenPeriod` currently call public `period()` through the root pool while holding
their transaction. This reads outside the snapshot and can exhaust a small pool. The score collector
and domain scoring functions remain the authority; no new criterion or frontend slice is needed.

## Decisions and reuse

Reuse PostgreSQL, Drizzle, existing task fencing and `enqueueBonusRecalculation`. Keep source mapping
in a narrow DB-reading helper, independent of BonusService/Nest module injection. EventStore requires
a Transaction and returns the persisted event identity and occurredAt. Its explicit whitelist admits
intents in the source transaction; it never takes the month guard or calculates scores synchronously.
Keep UI/SSE change streams and remove only required business recalculation subscriptions.

### Source mapping

- Actual direct sources include terminal shift events, `SHIFT_CORRECTED`, `SHIFT_SUMMARY_COMPUTED`,
  `SHIFT_FLAGGED_FOR_REVIEW`, and relevant plan/projection recovery. Do not invent SUMMARY_CORRECTED.
- Support historical `DOWNTIME_UNREGISTERED_CONFIRMED` and `SYSTEM_INCIDENT_APPLIED` inputs, despite
  no current emitter being found. `BONUS_SCORE_COMPUTED` never invalidates itself.
- Handover inputs resolve the actual parent record. In particular, HANDOVER_ACCEPTED/DISPUTED carry
  the reviewer session: resolve payload.handoverId to the author's shift. Checklist answers, attached
  photos, cannot-complete, submission and resolution retain their actual parent identity.
- Media targets are non-superseded handover parents, as already implemented; do not invent medical
  or incident-image scoring. Timer escalation timestamps do not change current scoring inputs.
- Requests resolve the union of direct session, assignment sessions and employee/date-range sessions.
  REQUEST_CANCELLED has no direct session and requires payload.requestId lookup. Preserve existing
  incident invalidations through downtime-report links; presence changes resolve their linked shifts.
- Manual adjustment/update/cancel/review records a source in its transaction. Second approval needs
  an explicit BONUS_ADJUSTMENT_SECOND_DECIDED event. Reopening a period creates fresh invalidations;
  completed tasks from the closed period remain immutable.

Each source-event/target pair is distinct. Runtime validation checks payload version, source/target
binding, canonical key and concrete payload. Orphan/deleted legacy parents resolve zero targets;
they must not create perpetual failing jobs. A valid nonterminal target can be stale; a terminal
target missing a required summary must remain diagnostic/retryable rather than falsely scored.

### Month guard and evaluation

Add `bonus_month_guards`: checked YYYY-MM primary key and bigint revision. The helper performs
INSERT ON CONFLICT DO UPDATE revision = revision + 1. One row serializes the same month across all
sites, including unknown ownership; different months remain independent. No advisory-only mutex.

Lock order is task, if applicable, then month guard, sorted session IDs, period, scores and adjustment
or result rows. Pre-reads locate the month only; reread state after locks, before CONFIRMED checks.
Source admission never locks this guard or updates an existing task under a business lock.

Expose evaluateWithin(tx) and periodWithin(tx), using the same transaction in every nested query.
Normal/task evaluation stays READ COMMITTED under the guard: later committed source changes retain
another durable intent and preliminary results converge. Score, criteria, computed event and task
completion commit together. Manual operations may evaluate inside their existing guarded transaction
to preserve the API response, with an intent as recovery insurance. inputsHash includes consumed
adjustment values and manual review decisions, not only adjustment IDs.

### Period snapshot

closePeriod uses one REPEATABLE READ transaction and at most three complete 40001 retries. Acquire
the guard, lock existing eligible terminal sessions including missing scores in stable order, create
or lock the OPEN period, and evaluate all eligible sessions before marking CLOSED. Keep the existing
membership rules for this increment; historical KNOWN/UNKNOWN scope belongs to risk #1.
The CLOSED guard must use that same membership, including unassigned PENDING/MANUAL_REVIEW scores;
a null place must not bypass protection for a period that currently includes the score.

Read periodWithin on that same snapshot, then confirm eligible scores and commit saved aggregates,
audit, event and notifications atomically. A pre-snapshot input is included even with a pending task;
inputs outside the successful snapshot are late. Pending tasks are not force-completed by closure.
Subsequent tasks respect CLOSED/CONFIRMED state. Closed API/export aggregates use saved results;
reopening restores live calculation and admits new work. Guard reopen and base-amount mutations too.

### Recovery and lifecycle

The API dispatcher uses the deployed fenced task helpers and a bounded non-overlapping runtime loop.
Recovery performs event-to-target anti-joins before LIMIT, repeating without timestamp cursors or
starvation behind irrelevant events. A legacy terminal missing a score and any real source may use
one stable audited recovery event, never a new identity per scan. Retain all completed intents.

The monthly nomination closer adds an immediate startup tick, retains its hourly cadence, prevents
overlap and awaits in-flight work on shutdown. Multi-month backfill is not implicitly added. Remove
false-success behavior of the unused legacy bonus worker without purging its queue or inventing a
legacy payload format. API startup migrations gate any new guard-table consumer.

## Lean review

Proceed. Lost background work forces repeated checking and can display stale assessments. The
smallest correction retains accepted inputs and freezes a coherent period result, with no new worker
button, scoring rule or administrative screen. Measure source-to-score delay, pending age and duplicate
effects. Preserve confirmed history and never ask employees to repair infrastructure failures.

## Verification

Design experiment on PostgreSQL 18.6, 2026-09-10: RR waiting on an advisory lock read score 100 after
the writer committed 200. Both existing-row and initially absent-row revision UPSERT cases waited
on an observed pg_stat_activity lock, failed with 40001, and read 200 after whole-transaction retry.
There were no race sleeps; the isolated container was removed. Script:
`/tmp/vakhta-bonus-month-guard-pg18.mjs`; results: `/tmp/vakhta-bonus-month-guard-pg18.log`.
Source: [PostgreSQL repeatable read](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-REPEATABLE-READ).

Required implementation regressions: both guard races; same/different month and cross-site/null scope;
evaluate/manual operations versus closure; pre-snapshot pending invalidation and missing score;
post-snapshot input separation; source/task/finalization rollback; source admission while guard busy;
max-one-connection close/reopen; real handover/request mappings; two distinct source identities;
orphan recovery; stable recovery marker; confirmed preservation; reopen/base/export consistency;
dispatcher restart/fencing and startup/shutdown. Then full build/check, independent review and
authenticated desktop/mobile panel, paired kiosk and worker Telegram QA.

## Remaining work

Implement this design with RED-first PostgreSQL regressions, then deploy and record evidence. Risks
#1 and #4 remain separate required work. The nine-risk request is not complete.
