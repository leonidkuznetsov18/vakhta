# Feature: estimated shift closure

## Outcome and scope

Approved owner clarification for critical reliability #8: planned day 08:00–20:00 / night 20:00–08:00,
two-hour grace, actual QR confirmation time during grace, estimated planned end when no QR arrives.
Baseline: bcb61de. Product behavior: [estimated shift closure](../../features/estimated-shift-closure.md).
No production records were changed during implementation.

## Current behavior and ownership

`ShiftService` owns the existing FSM transaction, projection, summary, event stream and notification
outbox. `AttendanceService` owns the linked presence update. `projectEstimatedClosure` is a pure
domain function that preserves IDs and clips every interval to the effective accounting boundary;
intervals beginning during grace become zero-length placeholders, rather than being deleted.
The compensation event records each affected interval's original and projected timestamps. Existing
immutable events are never updated. The compensation stores the complete original interval order. A shared reader validates that JSON
and uses its frozen ordinal for equal projected timestamps, so correction never mistakes UUID order
for the original sequence (including legacy rows with equal createdAt).

The panel and bot render prepared server data. The existing `autoCloseReason` identifies estimated
session ends; loss report rows additionally expose `estimatedEnd`, including exports. Zero-length
placeholders are excluded from loss counts and downtime-related bonus evidence, while positive
sub-minute intervals remain valid observations even when rounding produces zero minutes.

## Decisions and reuse

- Reuse `apply(AUTO_CLOSE)` and existing domain FSM effects, event store, audit log, notification
  outbox and `NEEDS_CLARIFICATION` presence state. No new framework, dependency or database table.
- Lock order for commands, scanner, master closure and correction: employee NO KEY UPDATE, shift
  UPDATE, then the specifically linked presence UPDATE. The weaker employee lock remains compatible
  with foreign-key key-share locks. Nested handover and incident commands share the deadline guard.
- At `now >= planEnd + 120 minutes`, public start/transition/master/QR commands catch up the due
  shift transactionally before proceeding. Nested workflows reject late commands; their rollback
  does not pretend an independent scheduled closure committed. Startup and periodic scanning, plus
  authenticated `/start`, provide catch-up and audited historical-presence reconciliation.
- QR rejection is checked before due-close writes: an invalid or expired QR leaves shift/presence
  unchanged. Replay is checked before deadline processing, so a completed receipt cannot modify a
  later shift. New Telegram departure buttons carry `dep:<22-byte-token>:<36-byte-presence-id>`
  (63 ASCII bytes); legacy unbound buttons request a fresh scan.
- Actual QR end and physical presence departure stay actual. Automatic close sets `endedAt` to the
  persisted plan end, `updatedAt` and event `occurredAt` to observed execution time, flags review,
  and sets the linked OPEN presence to NEEDS_CLARIFICATION with null departure fields. Summary
  `computedAt` is observation time, separate from accounting end. Persisted session plan wins over
  later assignment data. No physical exit time is fabricated.
- For an unscheduled shift, reuse site templates and existing timezone/DST planning. Missing
  templates use fixed 08:00/20:00 local templates. Missing legacy plans recover from the
  original start or first recorded interval, valid original assignment or historical site template,
  with a `SHIFT_PLAN_RECOVERED` event. A unique configured site is permitted only as explicit
  timezone/window inference (`inferredFromUniqueSite`), not historical authorization ownership.
  No recorded start or ambiguous site means UNRECOVERABLE_PLAN and no guessed timestamps.
  A stale same-day arrival never replaces the original start during recovery. A valid persisted end is preserved even if plan start is missing.
  Invalid persisted boundaries are flagged for clarification rather than replaced. One failing employee
  is logged and isolated so the scanner continues to the rest. Scanner time never becomes the planning anchor.
- Historical reconciliation requires an OPEN presence with at least one linked terminal shift and
  no linked active shift, rechecked under the employee mutex. It changes only that presence and
  appends `PRESENCE_DEPARTURE_UNKNOWN` plus an audit entry. Repetition and unrelated new presence
  are no-ops; existing shift records retain their historical timestamps.
- Current acceptance timestamp is the trusted command execution time passed as `now`, not the
  phone scan timestamp. Durable inbox #4 will need immutable acceptedAt separately from observedAt,
  and a pending-command fence before scanner closure. This patch makes no claim that queued
  pre-deadline commands already survive a later dispatcher using their original receipt time.
- Required timer/media/bonus effects still use the current implementation; durable effects #5 is
  separate work. PostgreSQL plus Redis/Telegram is not claimed to be exactly once.

## Lean review

Proceed. Baseline regressions demonstrate a missed exact deadline and inflated time after delayed
scanning. The smallest worker-facing change explains an estimated end without adding a new menu,
confirmation or field. One fresh QR remains the normal departure path; stale confirmations cannot
silently affect another workday. No blame or production-throughput inference is attached to server
lag. Measure duplicate callbacks, overdue active shifts, unknown-departure clarifications and
repeated worker attempts after deployment. Review grace-window history before changing accounting;
stop rollout if confirmed QR times are shortened or an unrelated presence is changed.

## Verification

2026-09-10, local PostgreSQL integration testing. RED: both initial new tests failed on baseline;
exact deadline closed zero shifts and delayed scan retained intervals after the planned boundary.
Initial GREEN: 56 affected integration tests passed (shift, attendance QR callback, handover,
incidents and losses). Expanded focused runs passed 48 tests (auto-close, bonus, losses), followed by
41 tests (24 auto-close PostgreSQL regressions and 17 Telegram screen regressions). Full build/check
evidence follows below.

Final source build passed all eight tasks freshly. The complete test run passed 440 tests: API 216,
domain 136, admin web 55, worker 19, i18n 10 and contracts 4. Typecheck and lint passed. The first
full attempt exposed an obsolete no-plan overtime fixture and a transient test-container host-port
timeout; the fixture now tests real computed overtime from a persisted plan, and the final app E2E
suite passed all six tests. The last formatting-only issue in the bonus regression was fixed and
full `pnpm check` passed afterwards (216 API tests freshly executed, 224 tests from cache; all
440 had passed in the preceding final-source run as well). `git diff --check` passed.

Independent core and UI/report/correction/Lean reviews approved the final source with no blocking
findings. The deadline bot regression also passed 7/7 through real `createBot`, PostgreSQL and a
fake Telegram transport: the worker receives the actual automatic-closure screen, not a false claim
that arrival was never recorded. No required live checks are represented as local test evidence.

Live panel desktop/mobile, paired kiosk and worker bot QA, independent review and deployment are
owned by the integrating agent. Local tests do not prove deployed behavior. No credentials or
production mutations were used by this implementation agent.

## Remaining work

Integrate durable inbox and effects under their separately approved risks. Monitor audited
unknown-departure reconciliation in production. Live arrival/checklist/departure mutation needs an
isolated employee/terminal fixture; no real attendance was manufactured for QA.

Legacy bonus scoring still derives plan/weight from its existing mutable assignment path; this patch
only excludes zero-length projection placeholders. Persisted-plan summary behavior is covered
separately. Changing the remaining bonus weighting policy requires its own scoring decision.

## Production verification

2026-09-10: commit `a9be981`, CI `34477355497` all successful, release v0.70.7. Pages uploads,
images and the existing Telegram announcement succeeded. Railway API deployment
`4b3da8c2-ea40-4239-b63e-5226b6fbaee2` reports SUCCESS at that source.

Read-only preflight found six active shifts, zero missing plans/overdue deadlines and two OPEN
presences linked only to terminal shifts. After deployment: six active shifts, zero overdue shifts,
zero terminal-only OPEN presences, two reconciliation events and two linked NEEDS_CLARIFICATION
presences with null physical departure fields. Startup recovery produced these audited changes;
no manual production shift or attendance command was issued.

Authenticated panel `dev@vakhta.xyz`, v0.70.7: current-day operations, filters and cards were readable
on desktop and 390x844 mobile. No automatically closed example existed on that day's view; the new
estimated-status rendering is covered by local regression evidence. Paired kiosk Основний retained
pairing, updated connectivity and showed its renewal countdown. No QR attendance scan was performed.
A fresh `/start` in the authorized `@cryptoleonid` Telegram session showed the idle QR guidance,
without the old stale open presence. Mobile text/buttons were readable; viewport overrides were reset.

Public API health returned ok. Capped deployment error logs and HTTP >=500 samples since 12:43 UTC
returned zero records; these bounded checks do not establish an all-time absence of errors.
