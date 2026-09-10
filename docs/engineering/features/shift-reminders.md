# Feature: shift reminder delivery

## Outcome and scope

Owner decision, 2026-09-10: remind employees 30 minutes before the actual scheduled start; do not
disturb employees on approved vacation, sick leave or day off. Only approved absences suppress
reminders; submitted/in-review requests do not. Preserve shift, approval and payroll semantics.
Product behavior: [Schedule](../../features/05-schedule.md).

## Ownership and decisions

- `SHIFT_REMINDER_LEAD_MINUTES` supplies the API/worker/recovery default (30 instead of 120).
  Production API and worker had no explicit `SHIFT_REMINDER_MINUTES` override during inspection.
- Publication/recovery still commits durable reminder intents. Old intents may become due two hours
  before the shift; admission now writes `notification_outbox.nextAttemptAt` no earlier than the
  30-minute window. This preserves durable task keys, deduplication and recovery evidence.
- `timers/shift-reminder-policy.ts` reads a current PLANNED assignment in a PUBLISHED version for an
  ACTIVE employee. It excludes approved VACATION/SICK/DAY_OFF periods inclusively by business date,
  approved CANNOT_ATTEND for the assignment and sessions already created for the assignment.
- The outbox relay repeats that check immediately before each delivery attempt, including retries.
  Invalid/obsolete reminders become SKIPPED. Legacy early outbox messages are deferred without
  consuming retry attempts; a dedicated deferred count appears in existing relay logs.
- Current localized text is rebuilt at delivery, preserving the existing Telegram message format.
  No new buttons, notification types or changes to acknowledgement/publication messages.
- No production attendance or request records are rewritten. No schema migration is required.

## Concurrency and limits

Keep the existing timer version/assignment locks and outbox SKIP LOCKED delivery ownership. The
delivery eligibility read intentionally does not acquire schedule locks while holding outbox locks:
publication uses the opposite path. It observes committed eligibility before sending; approval that
commits after that check cannot recall an in-flight Telegram message. Telegram send and database
commit remain separate failure domains; this does not claim exactly-once external delivery.

The system can only suppress absences recorded and approved in Vakhta. A verbal agreement or an
unsubmitted medical absence is not inferred. Absence boundaries use the assignment business date,
not UTC date or the date on which a pre-midnight reminder is sent.

## Lean review

Proceed. Move existing reminders nearer the required action and suppress irrelevant reminders;
add no worker interaction or data entry. Check delivery timing, obsolete-message skips and worker
reports of unwanted messages after release. Do not infer actual attendance or blame from notifications.

## Verification

Focused PostgreSQL integration coverage: old two-hour timers, early legacy outbox messages, exact
30-minute boundary, deduplication, each approved absence type, pending/rejected/cancelled/expired
requests, inclusive period bounds, a night shift across the local date boundary, cancelled/replaced
assignments, superseded versions, blocked/terminated employees, shift start, already started sessions
and absence approved between a failed Telegram attempt and retry. Delivery uses a fake Telegram sender;
no production employees are contacted by tests. Existing worker/outbox and durable timer tests apply.

Local verification: 21 reminder-policy cases, 4 existing worker/outbox cases and 20 durable timer
cases passed across the focused runs (45 distinct tests). Worker/API typechecks, affected ESLint,
formatting and diff checks passed. One independent read-only review found no blocking defects;
configuration examples/comments and direct CANNOT_ATTEND coverage were completed from its feedback.
Production API/worker configuration was checked: neither overrides the 30-minute default. Deployment
is the remaining delivery gate. No UI/layout or message-copy change requires unrelated screenshots.
