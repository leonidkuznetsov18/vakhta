# Tenant users

## RECON

Authorized by the owner on 2026-09-22: client-list totals and a separate tenant directory grouped
by the shared roles. Existing employee and panel identities have no foreign-key link. Reuse domain
WEB_ROLES, i18n role labels, operator MFA guard, tenant database secrets and Control primitives.
Other sessions own invitation changes in Control; preserve and selectively stage around them.

## SPEC

- Count ACTIVE employees plus distinct panel users with roles and credentials, without multiplying
  by role/scope assignments. Include all current active seats, not a recent-activity window.
- Show counts in Clients and a Users tab with all role counts, names, email, avatars, search and
  pagination. Clearly explain separate employee/panel identities and overlapping role counts.
- Read-only authenticated operator access; query only the selected tenant database. Return no
  passwords, tokens, HR-sensitive fields or private storage keys.
- Unavailable data is not zero; preserve cached data on refresh failure, expose retry/offline/loading.
- Shared domain role catalog supplies contracts, database enum declaration and both panel labels.

## DESIGN

A dedicated Control users module owns cross-database reads. Aggregate counts are requested in
bounded batches for the visible client page; directory reads use database pagination and a consistent
snapshot. Frontend FSD feature tenant-users owns Query options and read-only UI; pages compose it.
Reuse the existing neutral Control palette, Geist type, table layout and avatar primitive. Total is
primary; role filters carry counts, and directory rows stack on mobile. No new dependencies.

## VERIFY and HARDEN

Required: real PostgreSQL count/dedup/pagination/isolation/guard regressions, frontend asynchronous
states and role filtering, affected type/lint/build checks, independent review, desktop/mobile
screenshots. Single writer and index owner: this task. Evidence and delivery to be recorded below.

## Verification evidence (2026-09-22)

- Real PostgreSQL 16: six passing tests cover 1000 workers + 11 panel users = 1011 seats,
  role/scope deduplication, matching emails without unsafe identity merging, changed roles,
  pagination/search, missing/failed databases, tenant isolation, MFA and avatar prefix boundaries.
- Control UI: 49 tests passed, including four inventory query/router regressions for total links,
  filtering/search, failure/retry, retained data and offline state. i18n: 13 tests; architecture: three.
- Control API typecheck and Control API/web builds passed. Scoped ESLint and formatting passed.
  Vite retains its existing large-bundle warning. No full local monorepo suite was run.
- Independent read-only review found enum-order drift. Fixed by passing the shared WebRole object
  in the existing PostgreSQL order to pgEnum while preserving WEB_ROLES/primaryRole precedence.
  The reviewer verified the generated enum matches the existing snapshot and emits no migration.
- Chrome local synthetic directory: inspected 1440x1000 and 390x844 screenshots, HR filtering,
  total-to-directory navigation, touch tooltips and long list pagination. Mobile document width
  remained 390px. These screenshots use fixtures, not production employee actions or device QA.
- Avatar reads reuse the private object reader behind the operator guard and verify the exact
  tenant/employee path. Unavailable pictures fall back to initials. Connect/query timeouts and
  four concurrent database reads per batch bound failures; driver errors are sanitized.
- Production delivery and live verification remain pending until CI and service deployment finish.

## Filter stability correction (2026-09-22)

Owner request: remove unnecessary rendering, filter flicker and leaked work on Users. Production
reproduction with 2.5 seconds of network latency showed role controls, totals and directory removed
while each uncached filter loaded. This was query-state layout replacement, not evidence of a leak.

Acceptance: keep the current tenant's directory mounted while filters/pages load, keep search typing
local, reuse fresh filter results, cancel superseded/unmounted requests and reject late responses.
Do not retain another tenant's data during navigation. Required result changes still render normally.

Use the existing FSD feature, React Compiler, URL-backed applied filters and local search draft;
TanStack Query remains the sole server-state owner. Its same-tenant placeholder preserves results,
60-second freshness matches existing polling, and AbortSignal retains request ownership. Carry the
resolved page with its result so pagination does not relabel old rows as a new page. The shared loader
occupies a reserved header slot during refresh; no extra spinner implementation or effect/store exists.
Sources: [TanStack paginated queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries),
[query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
and [React Compiler](https://react.dev/learn/react-compiler/introduction).

Verification: 11 Users tests passed with the real QueryClient/Router, including five existing
journeys plus stable DOM nodes, local typing without row recomputation, fresh-cache reuse, pagination,
late-response cancellation, unmount observer cleanup and cross-tenant placeholder exclusion.
Scoped ESLint, formatting, Control TypeScript and production build passed. Existing bundle-size and
upstream Zod annotation warnings remain. No whole-application heap/leak audit is claimed.

Chrome fixture screenshots captured and visually inspected at 1440x900 and 390x844, including a
3-second pending filter. Search top stayed 514px on desktop and 752px on mobile; mobile document
width stayed 390px. Initial loading, retained rows, empty results, retry and offline are covered by
component tests. Browser console warnings came from installed wallet extensions, not the app.
The simultaneous tenant-actions task owns the Router's tab-only search subscription improvement;
its unrelated changes are excluded from this commit. Production publication is pending CI.
