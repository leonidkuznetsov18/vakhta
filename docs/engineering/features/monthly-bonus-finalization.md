# Feature: immutable monthly bonus nominations

## Outcome and scope

Prevent a scheduled retry or late approval from crowning a different winner and paying a second
team. Preserve the existing three nominations and award amounts. No manual reopen or new score.
See [the product document](../../features/09-bonus.md).

## Current behavior and ownership

`packages/domain/src/bonus/month-nominations.ts` owns pure selection and stable tie ordering.
`apps/api/src/bonus/bonus-month-nominations.ts` prepares live and stored nominations for both the
panel and closer. `BonusMonthService` owns the finalization transaction; `BonusService.points`
reads the stored result when one exists. The existing bonus frontend slice renders a prepared
localized status from `nomination-status.ts`. No new React hooks or lifecycle wrappers are used.

The unique `(site_id, month)` row in `bonus_month_closures` freezes employee/department identity,
name and points, all master names and matched employee IDs, rule version and closing instant.
An empty final month is represented explicitly. SQL rejects update, delete and nonempty truncate.
Null-site views stay live. Ledger totals remain live and are not claimed to be immutable.

## Decisions and reuse

Reuse the existing checklist ledger, monthly award uniqueness, active assignment/email matching,
notification templates and delivery dedupe key. Employee points aggregate across departments;
department nomination still counts checklist points only. Positive ties use English-locale name
ordering then ID, and all distinct masters for the winning department remain represented.

The closer uses REPEATABLE READ, a site NO KEY UPDATE lock and up to three complete-transaction
retries on SQLSTATE 40001. Awards, final row and notification outbox commit together. Delivery remains
asynchronous through the existing outbox; it is not claimed atomic with Telegram transport.

Migration 0026 takes SHARE ROW EXCLUSIVE locks on awards and outbox before checking for legacy
monthly awards/cards. Any existing legacy result fails closed and requires reconciliation; never
reconstruct or recrown from today's organization or localized text. During rolling deployment,
deferred constraint triggers require monthly award/card inserts to have a matching closure inserted
by the same transaction. PostgreSQL `xmin` is compared to the current transaction ID only during that
commit check, not used as a permanent version token. This admits the new atomic closer and rejects
legacy closers, including notification-only closes and additions against an older final row.
All trigger functions pin their search path and qualify protected table reads, so a temporary
shadow table cannot bypass history protection. Ordinary checklist awards and outbox delivery updates
are unaffected.

Before applying, repeat read-only counts of legacy monthly awards/cards. A nonzero result aborts
migration. The production preflight communicated by the deployment owner on 2026-09-10 had zero
monthly awards and cards; that observation is not a substitute for the deployment-time check.
Rolling back to an old API after this migration leaves its monthly closer safely failing. Keep the
new closer or pause that scheduled job; never remove immutable history to make a rollback succeed.

Sources: [PostgreSQL transaction IDs](https://www.postgresql.org/docs/16/functions-info.html),
[constraint triggers](https://www.postgresql.org/docs/16/sql-createtrigger.html),
[explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html).

## Lean review

Proceed. Repeated crowns and changing names force workers and managers to reconcile contradictory
results. One final decision plus a visible preliminary/final label removes that rework without
adding a worker step. Keep the existing Telegram card and keyboard. Local tests demonstrate stable
results; no claim is made about measured shop-floor throughput. After rollout verify one authorized
monthly card and the corresponding panel decision, then monitor for retries and duplicate awards.
Do not manufacture production shifts or monthly winners for this check.

## Verification

2026-09-10, local PostgreSQL 16 testcontainers: initial late-approval/empty-month regressions failed
against the old closer (2 RED); initial fix passed. Legacy award/card writer regressions also failed
before SQL guards (2 RED). Tests cover concurrent and empty closes, rollback on notification failure,
late points, renamed/transferred people and changed roles, cross-department employee totals, final
panel data, SQL immutability and migration rejection. Independent review found a temporary-table
shadowing bypass in the initial SQL guard; its regression failed before search-path hardening and
passed afterward (17 monthly integration tests). PostgreSQL 18 migration and atomic award/card
closure smoke tests also passed; this is local engine compatibility evidence, not production QA. Isolated test fixture resets temporarily disable
only the snapshot user triggers; production code never does so.

Final local verification on 2026-09-10: `pnpm build` passed (8 tasks, 2 cached), and `pnpm check`
passed typechecking, lint, all 406 tests and formatting. In the final check, API 185, panel 55,
worker 19 and i18n 10 tests executed fresh; domain 133 and contracts 4 used successful cache evidence
from the preceding run. Targeted monthly integration tests executed fresh after SQL hardening
(17/17). The final migration also passed the PostgreSQL 18 smoke test for same-transaction awards,
cards and rejected legacy writes. Migration SHA-256:
`fc7d92824289557a1be86c9aafc192439f61c6561120a07af3b311727145964a`.
Live authenticated panel desktop/mobile, kiosk and worker Telegram verification belongs to the
root deployment/QA owner. Local fixture tests do not establish the deployed revision or live UX.

## Remaining work

Independent review and deployment-time preflight/QA are required before claiming production delivery.
The existing employee/month notification dedupe key and award uniqueness are deliberately unchanged;
multiple sites do not create a new global monthly award policy. Old score/manual period APIs remain
separate compatibility paths and are outside this correction.
