# Feature: Loss report integrity

## Outcome and scope

Fix critical audit risks 6 and 7: transfers, repeated comments and duplicated dictionary codes must
not change recorded time; a partial display must not masquerade as a complete report. This change
covers report reads, exports and their panel notices. It does not change recorded shifts, bonus
scoring, authorization, auto-close rules or database schema.

## Current behavior and ownership

Product: [Reports and audit](../../features/10-reports-and-audit.md).

- `apps/api/src/reports/losses.service.ts` owns one relational source for aggregation, detail,
  count and export. Its historical site/department fields are the seam for scoped authorization.
- `packages/contracts/src/reports.ts` validates the optional ISO cutoff and explicit boolean
  `noReason` query. `false` no longer becomes truthy through JavaScript coercion.
- `apps/admin-web/src/reports/report-presentation.ts` prepares localized notices and export
  parameters. The existing report component renders them; TanStack Query owns fetched data. The HTTP response
  is validated with the shared Zod schema before enabling downloads; incomplete/older responses
  show a localized retry message instead of asserting completeness.
  A failed background refetch disables exports even when TanStack Query retains an earlier result.
- Catalog changes are present in all three languages. No forbidden React hooks were introduced.

## Decisions and reuse

Reuse Drizzle queries/transactions, PostgreSQL aggregation, the existing XLSX library, shared
contracts, catalog formatters and panel primitives. No new dependency or migration is needed.

1. Select the latest valid employee position at shift start using a half-open validity range and a
   deterministic ID tie-break. Existing overlapping history cannot multiply report rows. For a
   legacy session missing `startedAt`, use its earliest interval as the historical anchor; never
   substitute the current position. Missing matching history remains unassigned.
2. Reason dictionaries use `(kind, code)`. Only a DOWNTIME interval joins DOWNTIME reasons; unknown
   legacy reason codes remain readable as their stored code rather than borrowing another kind's
   label. This prevents reason joins from multiplying interval rows.
3. Aggregate comments within `[interval start, effective end)`, ordered by timestamp and ID. A
   boundary comment belongs only to the following interval. Comments are not separate time rows.
4. Use one cutoff for every duration. The effective end is the earlier of stored end and cutoff;
   exclude intervals that start at/after the cutoff. Future requested cutoffs are capped to request
   time. Round once per row, then sum the same integer minutes everywhere, including CSV/XLSX.
5. Each overview/export uses PostgreSQL REPEATABLE READ. This protects count/detail/aggregates
   against different committed versions during one execution. `asOf` is a duration cutoff, not an
   immutable data version: later historical corrections can change a subsequent execution.
6. Count is independent of the 500-row detail limit, including the top-level report. The page names
   displayed and matching counts and truncation. Export checks the full count in its transaction
   and rejects over 20,000 with `REPORT_EXPORT_TOO_LARGE` (422). The UI disables oversized downloads
   and provides a localized next action. Successful exports include cutoff/generation columns and
   audit filters, count and times. The limit bounds the existing in-memory XLSX implementation.
7. Period headline totals retain their existing scope; category/reason/noReason select detail and
   reason bars. The true count always follows the same selection as the export.

Primary references consulted during implementation:

- [Drizzle PostgreSQL transaction configuration](https://orm.drizzle.team/docs/transactions).
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

## Lean review

**Proceed.** PostgreSQL regression tests reproduced misattribution, a sixfold detail duplication,
incorrect cutoff, incomplete counts and silent export limits. Fixing the shared source removes
manual reconciliation and the risk of investigating the wrong department. Notices require no new
worker input and give one next action for an oversized export: narrow the filter. No new dashboard,
production metric or employee scoring is introduced.

The verification measure is equality of interval counts and rounded minutes across detail, bars
and exports, plus preserved department ownership after transfer. This is deterministic software
verification, not a claimed measurement of shop-floor throughput. Live mobile checks must confirm
that count/cutoff notices wrap without hiding filters or downloads.

## Verification

2026-09-10, local checkout, PostgreSQL 16 testcontainers. Initial RED: seven failing regression
scenarios (historical ownership, reason/comment multiplication, row arithmetic, cutoff, real count,
export rejection and false boolean query). GREEN: 15 PostgreSQL regression tests and four report/audit
component tests passed. API and panel typechecks, owned-file ESLint and the full build passed.
`pnpm check` passed: 387 tests across 68 files, with mixed fresh/cached workspace tasks; the API,
worker and panel test suites executed fresh. Independent review and live deployment evidence remain
with the integrating owner. Reproduce with:

```sh
pnpm --filter api exec vitest run src/reports/losses.service.test.ts
pnpm --filter admin-web exec vitest run src/reports/ReportsPage.test.tsx
pnpm build
pnpm check
```

Additional cases cover PostgreSQL's actual transaction isolation, a concurrent history update during
export with the old snapshot retained, CSV and XLSX output, overlapping/missing historical
assignments, open/future intervals, reason filtering, exactly 20,000 exported rows, cutoff passed to
export, explicit panel truncation and disabled oversized downloads. Component tests use jsdom and
are not proof of real mobile layout. No production employee record was changed for these tests.

## Remaining work

Independent review reproduced enabled downloads after successful load followed by invalid refetch;
the additional regression now protects retained query data and disabled exports. The integrated
build and check passed again: five report/audit component tests, 388 workspace tests across 68 files,
with API and panel executed fresh and the other test tasks cached. The integrating
owner must complete authenticated panel desktop/mobile checks
and deployment verification. The kiosk and worker bot are unchanged by report reads; report QA
must not manufacture attendance events. Authorization grant filters are handled in the separate
access-boundary fix and must apply to the same historical department fields. Saved immutable report
snapshots and streaming exports beyond the explicit limit are outside this bounded correction.
