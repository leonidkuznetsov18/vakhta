# Feature: durable timer recovery

## Outcome and scope

Critical reliability #5, timer increment after durable media. Baseline `3824f13`; the additive
`background_tasks` schema was deployed and verified before any consumer. Product contract:
[reliable reminders and escalations](../../features/timer-recovery.md).

Deliver source-transaction admission and atomic execution for SHIFT_REMINDER, ACK_REMINDER,
RETURN_REMINDER, DOWNTIME_ESCALATION, CLEANING_REMINDER and INCIDENT_SLA. HANDOVER_TIMEOUT is legacy
recovery/draining only. Existing modern handover submission already escalates immediately to the
master, and safety incidents already escalate immediately; neither receives an extra timeout.

## Ownership and reuse

- `packages/contracts/src/timer-tasks.ts`: discriminated version-one payload validation, existing
  domain job identities and the immutable fireAt/dueAt envelope. DB remains independent of contracts.
- `apps/api/src/infra/timers.queue.ts`: transaction-required TimerScheduler admission; the historical
  filename remains, but it constructs no Redis connection or BullMQ producer.
- Source owners: schedule publication/revision, shift start/transitions, incident report and
  openFromReview. The request-driven schedule revision retains its outer transaction from #3.
- `apps/worker/src/timers`: shared transaction-owned handlers, PostgreSQL dispatcher, bounded recovery
  and startup/shutdown driver. Legacy BullMQ wrappers call the same handlers while existing jobs drain.
- No frontend architecture or scoring criteria change. Bonus tasks/consumer and Telegram inbox remain
  separate increments. Notifications still use the existing localized outbox and delivery relay.

Reuse the deployed task lease/CAS helpers, current Zod job contracts, domain timer IDs, existing
notifications and PostgreSQL locks. No extra dependency, schema migration or queue framework is needed.

## Transaction and lock contract

New timer tasks persist with their source transaction, even when already due. fireAt and dueAt remain
identical and immutable; return limits and downtime thresholds are frozen in the payload. Dispatch
checks supported version, kind-specific schema, canonical key and exact fireAt/dueAt equality before
calling a handler. Invalid payload/version remains retryable with a safe classification.

Claims use the existing short SKIP LOCKED leases. The DB-only execution transaction owns the task
lock, business locks, required event/projection/outbox writes and fenced completion. Failure or lease
expiry rolls everything back. No network I/O or root-pool query belongs in a Within handler.
Independent attempts settle before another batch starts; an unexpected persistence failure is visible.
Shared handlers sample PostgreSQL clock_timestamp after obtaining all business mutexes. Neither PG
dispatch nor legacy wrappers freeze wall time before a lock wait; explicit Date overrides exist only
for deterministic tests. This prevents a delayed lock from authorizing a reminder past its deadline.

Business lock order:

- Schedule version before assignment. Acknowledgement takes the same version mutex as dispatch and
  publication, so a waiting reminder observes the committed acknowledgement.
- Shift session before its interval, matching transitions. The payload must name that exact session,
  interval and current state; the interval must remain open. Use the frozen session planned end,
  falling back only to its linked assignment. Missing deadline evidence cannot authorize a reminder.
- Incident row for SLA; handover row for acceptance timeout. Neither handler locks a shift afterward.

Source workflows never update or cancel an existing task while holding their business locks. Old
intents are retained for identity and history; stale guards decide whether they still apply. The old
post-commit cancellation optimization is removed. Remaining post-commit shift publication is a UI
change notification, not a required timer effect.

## Deadline and recovery contract

Each startup immediately runs recovery; normal polling is one second and recovery repeats each minute.
Each process has one in-flight batch. Shutdown stops new claims and awaits current work. Recovery
selects at most 100 candidates per relation/kind using repeated anti-joins, with no timestamp cursor.
A later commit carrying an older business timestamp is eligible on the next scan.

- Shift reminders: PUBLISHED version, PLANNED assignment and start still in the future.
- ACK: the same eligibility plus no acknowledgement; derive the original publication-based deadline
  from publishedAt. Never admit historical-month acknowledgement spam merely because an old row is
  still PLANNED.
- Return/downtime: exact open session/interval/state, before planned end plus the configured auto-close
  grace. Freeze the existing interval start plus the applicable limit/threshold.
- Cleaning: eligible active state and still before the persisted planned end; linked assignment is
  only a legacy fallback when that boundary is absent. No retrospective zero-minute cleaning request.
- Incident SLA: persisted slaDueAt. Preserve safety's immediate escalation. A committed old breach
  event can repair a missing escalatedAt even after acknowledgement/closure, without changing status,
  acknowledgement or other timestamps.
- Legacy handover: persisted acceptDeadlineAt. A prior timeout event can repair a missing escalation
  timestamp; a missing notification is repaired only while SUBMITTED remains actionable. Terminal
  handovers get no late notification. Existing dedupe keys use ON CONFLICT DO NOTHING and never reset
  SENT/FAILED rows. New events, projections and notifications are atomic.

Recovery optionally reads an existing BullMQ job by its canonical identity before admission. Valid
payloads retain their original configuration and fire time. A return payload must also match the
persisted interval state; matching identifiers alone cannot authorize a different state. Reads occur outside DB transactions;
a 500 ms timeout disables further Redis lookups for that pass. Redis failure cannot prevent durable
admission. When no usable old payload exists, recovery uses CURRENT worker configuration only for
still-relevant targets. Counts explicitly distinguish legacy payload use and current-config fallback;
this is not described as recovery of historical configuration. Persisted SLA/handover deadlines need
no configuration reconstruction. Later sweeps preserve admitted intents rather than changing limits.

No delayed BullMQ queue is purged. Both paths share business mutexes and existing effect dedupe keys.
Canonical completed tasks are not reopened or assigned an invented repair identity.

## Lean review

Proceed. The reproduced failure left an escalation event without its projection, making a retry
incapable of restoring the visible state. Source rollback and restart checks address lost reminders.
The smallest correction preserves work and current notification wording, adds neutral no-zone text
in all three languages, and suppresses instructions that are no longer actionable. It adds no worker
input or menu. Observe overdue task age, safe retry counts, recovered admissions and duplicate/stale
suppression during restart checks; no measured production-time or throughput benefit is claimed.

## Verification

Local RED: two new real-PostgreSQL SLA regressions failed against the baseline (two existing cases
passed): projection failure left a committed event; event-only legacy failure did not restore its
original escalation time. After the shared Within transaction, all four passed.

Focused checks covered 52 API cases, shared worker handlers, concurrent acknowledgement, neutral
wording in all three locales, source admission faults and atomic timeout notification failure.
Independent review produced two further RED regressions: a real PostgreSQL lock wait crossing the
cleaning deadline queued an obsolete instruction, and a legacy return payload could carry the wrong
state. The post-lock clock and persisted-state validation made both regressions pass.

The first complete check exposed an unordered test query selecting the other of two valid retry
records. The assertion now selects its exact intent key, retaining both error-code checks. The final
`pnpm build` passed eight tasks (worker fresh, seven cached). Final `pnpm check` passed six fresh
release tests and 508 package/application tests: API 223 and worker 80 fresh; domain 136, panel 55,
contracts four and i18n ten cached. Typecheck, lint and formatting passed. Logs are
`/tmp/vakhta-timers-root-build.log` and `/tmp/vakhta-timers-root-check.log`.

Both independent reviewers approved the final production code; the final test selection and comment
corrections were also reviewed. These are local fixtures, not executed production failures or employee
interactions. Deployment and authenticated QA remain the integration owner's next step.

## Rollout and remaining work

The integration owner handles CI/release and authenticated panel/kiosk/Telegram verification. Keep
legacy jobs and additive task history during rollback. Pending intents resume when the consumer is
restored. Do not manufacture production employee actions for QA.

Remaining #5: broader bonus source invalidations and API consumer, score/period concurrency guards,
and monthly closer startup catch-up. Historical known/UNKNOWN ownership belongs to #1. Timer source
and effect transactions preserve the prior QR departure, request and auto-close guarantees.
