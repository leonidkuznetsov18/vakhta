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
8. Latest owner clarification: day shifts run 08:00–20:00, night shifts 20:00–08:00, with two hours
   allowed afterwards for checklist and QR departure (22:00 / 10:00). This supersedes the earlier
   no-grace instruction. The owner confirmed that QR departure records actual time (including
   21:33), while missing QR closes automatically at 22:00 / 10:00 with accounted end 20:00 / 08:00.
   Actual departure remains unknown. Scanner delay must never inflate duration. Finish Shift opens the
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
- Commits `d844490` and `e41915e` passed GitHub run `34469551770`; release `v0.70.3` and the existing
  Telegram announcement succeeded. Railway API deployment `1e2ac6ee-d4d6-437b-a713-623aca9c1acc`
  reports SUCCESS at `e41915e`. Public liveness returned ok. A bounded seven-record deployment log
  sample contained no error-level records; the capped HTTP >=500 query since 11:16 UTC returned zero.
  These bounded observations do not prove absence of all runtime errors.
- Authenticated profile confirms `dev@vakhta.xyz`, enterprise administrator. Requests loaded and SSE
  connected after API deployment. The 390x844 mobile empty state remained readable; no application
  errors were captured (wallet-extension errors were excluded). Paired kiosk `Основний` showed its
  renewal countdown. The actual worker bot menu/history was inspected without shift mutations;
  fresh Telegram command execution was blocked by native automation input errors.
- Pages uploads were skipped because GitHub's Cloudflare token is missing; the panel still displays
  v0.70.1. The green Pages job is not deployment evidence. Remaining access/recovery/report/month
  fixes are in progress; these focused checks are not evidence that all nine risks are resolved.

### Subsequent report, delivery and nomination evidence

- Report commit `7195396` fixes historical ownership, interval multiplication, consistent cutoff
  arithmetic, truthful counts and explicit export limits (#6/#7). Integrated `pnpm build` and
  `pnpm check` passed 388 tests; the independent retained-query-data regression also ensures a
  failed refresh cannot leave a downloadable stale export. See `loss-reports.md`.
- CI correction `a5ee2e5` and the approved dedicated Pages token restored both actual uploads in
  run `34472618740`; panel and kiosk deployment history match that source. Authenticated panel
  v0.70.5 loaded loss reports, cutoff metadata and matching export links. Mobile 390x844 controls
  and cutoff text were readable. See the platform operations runbook for deployment IDs.
- Fresh worker-bot `/help`, `/start` and `/requests` responses were verified through the owner's
  authenticated Telegram Web session. No shift, attendance or request was created. The Back button
  was verified after dismissing an unrelated Wallet popup; it returned to the current home screen.
  The current home screen still shows an old open presence; a bounded read-only production query
  found two OPEN presences linked only to terminal shifts. Preserve this historical inconsistency
  for explicit unknown-departure reconciliation in #8 rather than inventing a departure timestamp.
- Monthly nominations (#9) now use an immutable site/month snapshot, atomic awards/cards and full
  transaction retries. Empty final months remain final. SQL also prevents the old closer from
  writing during a rolling deployment. Independent SQL review found and fixed a temporary-table
  shadowing bypass; its regression passed. Final build/check passed 406 tests (269 fresh, 137
  cached); monthly tests passed 17/17 fresh. PostgreSQL 18 migration/posting/legacy-rejection smoke
  passed. Independent SQL/core and UI/contracts/docs reviews have no remaining blockers. Production
  migration preflight found no legacy awards/cards. CI `34473900750`, release v0.70.6, Pages and
  announcement succeeded; Railway API `8aa15dd2-d423-428a-bb3c-d51081b7a5c1` runs `bcb61de`.
  Read-only production checks confirm the snapshot table and all four guards. Authenticated desktop
  and 390x844 mobile views show three readable preliminary cards. No month was manually closed;
  the first hourly closer tick remains pending. See `monthly-bonus-finalization.md`.
- Automatic closure (#8) now preserves actual QR time, closes after the two-hour grace with planned
  accounting time, and records unknown physical departure explicitly. Immutable compensation events
  preserve pre-projection history. Startup recovery repairs only terminal-linked orphan presences.
  Final build and full check passed 440 tests; independent core and UI/Lean reviews approved.
  A read-only production preflight found six active shifts, no missing plans or overdue deadlines,
  and two terminal-only orphan presences. CI `34477355497`/release v0.70.7 and Railway API
  `4b3da8c2-ea40-4239-b63e-5226b6fbaee2` succeeded at `a9be981`. After deployment, zero orphan OPEN
  presences remained; exactly two audited reconciliations preserved null physical departure. Fresh
  Telegram home no longer showed stale presence. Desktop/mobile panel and paired kiosk checks passed. See
  `estimated-shift-closure.md` for recovery, deadline, projection and full-bot regression evidence.
- Media processor slice of #5 (`2bb08b9`) atomically persists projection/completion event, repairs
  legacy event gaps and reuses received-month storage keys. Independent RED/GREEN and concurrency
  regressions passed; full check passed 444 tests. CI `34477914924`, release v0.70.8 and worker
  `dabc6453-849f-4bb3-a389-35d8925995b5` succeeded. Production has 57 media rows, zero pending and
  zero missing completion events. See `media-processing.md`; durable task admission is separate.
- Durable-task foundation `f9a437c` passed 469 tests and the PostgreSQL 18 smoke check. CI
  `34479700951` published v0.70.9; API `670ddf9c-ccb3-4ab0-8fb0-dc49650db362` and worker
  `e7c513f2-c0d7-446c-9310-35e11be8aa68` succeeded. Production schema, constraints and immutable-intent
  trigger were verified before enabling consumers. Media integration `e17b431` then passed 483 tests,
  build/check and two independent reviews: source-transaction admission, bounded I/O, fenced atomic
  finalization and repeating recovery. CI `34482489884`/v0.70.10 and both Railway deployments succeeded;
  authenticated desktop/mobile panel, paired kiosk and fresh Telegram help were verified. Startup
  admitted 39 missing bonus targets, still pending the future consumer. One later organic media task
  completed with its projection and event in one attempt. See `media-processing.md`.
- Timer increment `4383be6` persists source intents and shares atomic handlers between PG and legacy jobs,
  with bounded recovery and post-lock deadline checks. Final build/check passed 508 package tests
  (API 223 and worker 80 fresh, 205 cached) plus six fresh release tests; both reviewers approved.
  Timer production rollout is pending. Bonus invalidation/consumption and monthly startup catch-up
  remain separate work; see `timer-recovery.md` and `background-effects.md`.
- Access scope (#1), durable Telegram recovery (#4) and the remaining durable background effects (#5) remain
  implementation work. Do not report the nine-risk task complete.

## Technical references consulted

- [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [grammY error handling](https://grammy.dev/guide/errors)

## Lean recommendation

Proceed: recover failures without asking workers to repeat completed work or repair inconsistent
records. Keep QR/checklist flow simple. Separate estimated time from observed time so reports do
not attribute server delays to employees. Defer invented nomination criteria until clarified.
