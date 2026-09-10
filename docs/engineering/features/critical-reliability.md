# Critical reliability and access corrections

Status: implementation in progress. Baseline: `f9c4dea`. Owner: Codex integration owner.
Authorization: project owner requested correction of all nine audited risks on 2026-09-10 and
confirmed that the other writer was stopped. Work stays in the current checkout on `master`.

## RECON and accepted specification

The audit identifies code paths, not a measured production incident rate. Preserve recorded history,
existing worker interactions, Nest module boundaries and the pure shift FSM.

1. Apply role **and scope from the same grant** to lists, direct identifiers, mutations, exports,
   SSE and linked media. Unit A must not expose unit B; SITE is not ENTERPRISE. Medical files must
   retain their restricted access through every link endpoint.
2. Validate exit QR and close shift/presence in one transaction. Invalid/expired QR changes neither;
   injected failure rolls back both; retry returns the committed result without repeating changes.
3. Approving a request and changing all affected schedule months form one transaction. Injected
   failure after an intermediate publication leaves neither a changed schedule nor an approval.
4. Telegram updates distinguish processing from completion. Failure must remain recoverable;
   webhook errors must not be acknowledged as success. Completed delivery is deduplicated.
5. Required background effects are persisted with their source transaction and retried after
   process/Redis failure. Media, shift timers and legacy bonus recalculation must not depend on
   a surviving in-memory callback. Do not claim exactly-once delivery across PostgreSQL/Telegram.
6. Loss reports use the employee's historical assignment at shift start. Multiple downtime
   comments do not multiply an interval. Detail and aggregate arithmetic agree.
7. Reports have a common cutoff and consistent database snapshot per execution, accurate total
   counts and explicit detail/export limits. A timestamp alone is not an immutable saved report.
8. Owner clarification: day shifts run 08:00–20:00, night shifts 20:00–08:00. No auto-close grace.
   Close at the scheduled end; delayed scanning must not inflate duration. Finish Shift opens the
   checklist, departure QR after submission closes the shift, and QR without submission reminds the
   employee. Missing report and departure auto-close with the existing NO_CHECKLIST marker.
   Preserve actual recorded history and distinguish automatic closure from a confirmed QR departure.
9. Persist monthly winners and awards atomically. Repeated closing and late approvals must not
   select another winner or issue another set of awards. The owner requires three nominations:
   Employee of the Month, Department of the Month and Master of the Month. Reuse existing rules;
   any missing nomination criteria require clarification before new scoring behavior.

## DESIGN and implementation sequence

Reuse transaction-aware service methods, idempotency keys, the notification outbox, scope domain
functions and real-PostgreSQL test fixtures. First protect transaction/retry invariants, then apply
shared access predicates and report corrections. One writer owns changes at any time; independent
QA/review agents receive exclusive test-writing or read-only turns. No PRs or worktrees.

## Verification

Write a failing regression before each behavioral fix. Include rollback, concurrent retry, stale
input, cross-unit authorization, historical transfers, report limits and late monthly approval.
Run affected integration tests, then `pnpm build` and `pnpm check`, independent fixed-diff review,
and authenticated panel/kiosk/bot verification.

### Transaction regression evidence

- Independent full-bot regression reproduced expired QR closing the shift while presence stayed open.
  Atomic departure now passes expired/valid QR, injected failure rollback, expired replay and duplicate
  concurrent confirmation tests. Initial shift/attendance/QR suite: 20 tests passed.
- Independent review found an employee UPDATE lock / summary FK deadlock with master close. A
  deterministic two-operation regression reproduced PostgreSQL 40P01; the employee mutex now uses
  NO KEY UPDATE, compatible with FK key-share locks. All six QR regression tests pass, including
  departure versus master closure. Independent reviewer reports no remaining blocker in #2/#3.
- Request finalization failure reproduced two separately committed schedule revisions and timers.
  Shared transaction revision now passes the two-month rollback/retry regression; 13 request/schedule
  integration tests passed. Empty revised schedules use existing revise semantics, so approved leave
  can remove the last assignment without leaving an orphan draft.
- `pnpm build` passed (8 tasks, 6 cached). `pnpm check` passed; API executed 25 files / 156 tests,
  other test packages were cache hits. The supplemental last-assignment removal test passed;
  the request suite now has eight passing tests, with API typecheck and changed-file lint passing.
- No production deployment yet. Access/recovery/report/month fixes
  remain in progress; these focused checks are not evidence that all nine risks are resolved.

## Technical references consulted

- [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [grammY error handling](https://grammy.dev/guide/errors)

## Lean recommendation

Proceed: recover failures without asking workers to repeat completed work or repair inconsistent
records. Keep QR/checklist flow simple. Separate estimated time from observed time so reports do
not attribute server delays to employees. Defer invented nomination criteria until clarified.
