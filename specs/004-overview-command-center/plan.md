# Implementation Plan: Overview command center redesign

**Change**: 004-overview-command-center | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)
**Baseline**: 0d4da70 | **Checkout**: master | **Engineering memory**: [overview.md](../../docs/engineering/features/overview.md)

## Summary

Deliver in four increments, each independently releasable: (1) scope enforcement of the sources and
streams Overview uses; (2) shift context, selector and a prioritized action queue built on the
existing attention model; (3) a read-only shift health snapshot, terminal connectivity and zone board
computed by pure domain functions; (4) scoped live freshness and the operational event feed. Reuse the
current list queries, destinations, SSE plumbing and shared loaders. No
worker-facing change.

## Technical Context

- **Panel** `apps/admin-web` (React 19 + React Compiler, TanStack Query, Zustand UI store, Tailwind +
  shadcn). Current slice `src/features/overview/model/{attention,queries,destination}.ts` with tests;
  page `src/overview/OverviewPage.tsx`. Reusable: `components/app/{page,query-feedback,info-tip,
avatar-stack,how-it-works,row-detail}.tsx`, `Deadline`, `shared/ui/loading-state.tsx`,
  `lib/live.ts` (`useLiveUpdates`), `lib/format.ts` (`formatDuration`), `lib/ui-store.ts`.
  Local `Tile` components in Reports/Bonus/Overview are candidates for one shared KPI tile.
- **API** `apps/api` (NestJS 11 / Fastify): modules `shift`, `incidents`, `handover`, `requests`,
  `kiosk`, `org`, `scheduling`, `attendance`, `events`, `reports`. SSE: `@Sse('stream')` on four admin
  controllers over the in-process `shift/shift-changes.ts` subject.
- **Domain** `packages/domain`: `access/scope.ts` (`grantCovers`, `canActOn`, `reviewableUnitIds`),
  `time/plan.ts` (`planInstants`, `businessDateOf`), `time/deviations.ts` (`lateMinutes`),
  `scheduling/coverage.ts`.
- **Contracts** `packages/contracts/src`: add `overview.ts`; reuse `incidents.ts` stats types, `org.ts`
  terminals with `lastSeenAt`.
- **i18n** `packages/i18n` `admin.overview.*`, `ui.guide.overview`.

## Constitution Check

- Access boundaries are correctness: increment 1 precedes any selector or feed (spec P8). Server
  enforces scope; the panel selector only narrows within granted scope.
- Pure domain: window, staffing classification, zone-minute union, time-to-action and connectivity
  are pure functions with tests (C2). No writes; no FSM or `activity_intervals` changes (C3).
- FSD: extend `features/overview` with `model/` (view models, priority) and add `ui/`; move page
  composition out of `src/overview/OverviewPage.tsx` coherently. No `useEffect/useMemo/useRef/
useCallback`; live timers use the existing clock utility (`lib/clock.ts`).
- Validation at boundaries: zod contracts for new endpoints and query parameters.
- i18n in three catalogs; units via `formatDuration`; tooltips for every KPI and tier.
- Async: per-source unknown states, cached data preserved on refresh failure, stream offline state,
  no mutation retries (none are introduced).
- Out of scope checks: no OEE/output/equipment.

## DESIGN: Ownership and Behavior

### Increment 1 — Scope enforcement (US1)

- Resolve the user's grants once per request (existing auth context) and apply a scope predicate in
  `ShiftService` list/detail, incident list/detail/stats, overtime list and handover/request inbox
  (verify existing handover enforcement is equivalent). Direct identifiers outside scope → 403.
- SSE: tag each change event with `siteId`, `orgUnitId`, `zoneId` at publish time; filter per
  subscriber with `grantCovers`. The single-process subject remains; Redis pub/sub is not required here.
- Panel: no behavioral change except honest errors.

### Increment 2 — Context, selector, action queue (US2, US3, US9)

- Domain `time/shift-window.ts`: `currentShiftWindows(templates, timeZone, now, graceMinutes)` →
  `{ current, closingPrevious? }`; property tests for night/business date/DST.
- Contract `GET /admin/overview/context?siteId&orgUnitId` → granted site/unit options and per-site
  windows (server time is authoritative; the client ticks remaining time from `generatedAt`).
- Panel `features/overview/model/priority.ts`: pure mapping of existing `Attention` + deadlines/ages to
  tiered items (D-08) and a checked/unknown summary; setup items separated. Destinations unchanged;
  selection added to `attentionFilters`.
- UI: header (selector, freshness, help button opening `HowItWorks` content in a Sheet), action queue
  list rows (tier label + icon + count + oldest age/deadline + avatars + chevron), all-clear line,
  setup section. Remove zero-tile card and duplicate hint.

### Increment 3 — Shift health, terminals, zones (US4, US5, US6)

- Domain `overview/` (new folder): `classifyStaffing`, `zoneDowntimeMinutes` (interval union clipped to
  window), `timeToAction`, `handoverAcceptance`, `terminalConnectivity`, `zoneStatus`. Fixtures mirror
  AC-014–AC-022.
- API `overview` module (read-only): `GET /admin/overview/health?siteId&orgUnitId` and
  `GET /admin/overview/zones?...`; one repeatable-read transaction per snapshot; queries by window
  bounds with existing indexes (verify plans on seeded data); returns per-source availability.
- Terminal connectivity added to context/health response using `rotationSeconds` from kiosk options.
- UI: four KPI tiles (shared KPI tile extracted from Reports/Bonus local tiles), each with tooltip,
  `n/m` primary text, detail line, destination link; zone board as a responsive list/grid.

### Increment 4 — Live freshness and feed (US7, US8)

- Overview subscribes to the four scoped streams via `useLiveUpdates`, invalidating list keys and the
  new overview keys; polling fallback 60 s; header freshness uses the existing `LiveBadge`.
- Feed: `GET /admin/overview/events?siteId&orgUnitId&limit=30` reading `domain_events` of the D-10
  allowlist joined through zone → unit → site (events without a zone are excluded unless terminal
  events keyed by terminal site); SSE `overview` event type after commit. Payload is a prepared,
  localized-by-code view without free-text medical/request content.

### Compatibility and migration

Additive read endpoints; no schema migration expected. If query plans on `domain_events` by zone/time
or `activity_intervals` by window are inadequate, add an index migration in the increment that needs
it (reviewed as a migration).

## Project Structure and Allowed Files

- `packages/domain/src/access/scope.ts` (+tests), `packages/domain/src/time/shift-window.ts` (+tests),
  `packages/domain/src/overview/*` (+tests), `packages/domain/src/index.ts`
- `packages/contracts/src/overview.ts`, `packages/contracts/src/index.ts`
- `apps/api/src/{shift,incidents,requests,handover}/**` (scope predicates, SSE tagging and filtering,
  tests), `apps/api/src/overview/**` (new module), `apps/api/src/app.module.ts`
- `apps/admin-web/src/features/overview/{model,ui}/**`, `apps/admin-web/src/features/overview/index.ts`,
  `apps/admin-web/src/overview/OverviewPage.tsx`, `apps/admin-web/src/App.tsx` (only if route wiring
  changes), shared KPI tile under `apps/admin-web/src/components/app/`
- `packages/i18n/src/{uk,en,ru}.ts`
- `docs/features/11-admin-panel.md`, `docs/engineering/features/overview.md`, this change directory.

One writer and index owner at a time; other sessions' uncommitted work is preserved.

## Lean Review

Recommendation: **Simplify, then proceed** (recorded in the engineering memory). The value is shorter
time to action for the master; the page must drive a next step, not become a wall of metrics. Deliver
increments 1–3 first; the feed (increment 4) proceeds only if the moderated check shows masters still
leave Overview to learn what just happened. No new worker input.

## IMPLEMENT: Ordered Delivery

1. Baseline measurement on synthetic data (SC-004) before UI changes.
2. Increment 1 with invariant tests and independent review; deploy and verify scoped responses.
3. Increment 2 domain window → contract/endpoint → panel priority model → UI → i18n.
4. Increment 3 domain metrics → endpoints → KPI/zone UI.
5. Increment 4 scoped live invalidation → feed.
6. Acceptance: role screenshots, moderated check, docs.

## VERIFY and HARDEN

| Area                | Check                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-001–003          | API integration tests with real PostgreSQL: two units, scoped users per scope type, lists, identifiers, stats, SSE subscriber filter; one independent review |
| AC-004–007          | `pnpm --filter @vakhta/domain test` — shift window unit + fast-check properties (DST, night, grace)                                                          |
| AC-009–013, 019     | `pnpm --filter admin-web test` — priority model and component tests with deferred promises (loading, failure, cached refresh)                                |
| AC-014–018, 020–022 | Domain metric tests with AC fixtures; API test for the health snapshot on seeded data                                                                        |
| AC-024–026          | Live invalidation component test; feed allowlist and scope integration test                                                                                  |
| AC-027–028          | Screenshots 1440×900 and 390×844 per D-09 role in `uk` (long labels also `ru`), inspected                                                                    |
| Types/lint          | `pnpm typecheck` and `pnpm lint` for affected packages; CI is the full gate                                                                                  |

## REPORT and Documentation

Update `docs/features/11-admin-panel.md` Overview section when behavior ships; record decisions
D-01–D-10 final values, Lean result, evidence and deployed revision in the engineering memory.

## Open Decisions

- Confirm defaults D-03 (late grace as "not arrived" threshold), D-04 (3 × rotation and 60-minute
  boundary rule) and D-09 (role composition). They change thresholds and visibility, not architecture.
- Whether a comparison with the previous shift of the same kind is wanted in KPI detail (not in scope
  by default).
