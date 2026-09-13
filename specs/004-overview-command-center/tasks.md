# Tasks: Overview command center redesign

**Input**: spec.md and plan.md in this change directory
**Authority**: Specification and issue publication authorized 2026-09-13; implementation not yet authorized | **Writer / index owner**: implementing session | **Checkout**: master
**Evidence**: [docs/engineering/features/overview.md](../../docs/engineering/features/overview.md)

## Task Format and Rules

Tasks follow the local template. Writing tasks are sequential. GitHub issues group tasks by
independently deliverable capability (repository convention of epics #1–#3); each issue lists its
task IDs. The GitHub issue is the completion authority.

## Setup: Baseline measurement

- [ ] T001 Record the SC-004 baseline on synthetic data: clicks/pages to reach the right record for an SLA breach, an offline terminal and not-arrived staff; capture current 1440/390 screenshots; store in the engineering memory (covers SC-004)

## User Story 1: Scoped data for the command center (P1)

**Outcome**: scoped users see only their scope | **Acceptance criteria**: AC-001–AC-003

- [ ] T002 [US1] Add failing PostgreSQL integration tests for two units and ORG_UNIT/SITE/ENTERPRISE grants across `/admin/shifts`, `/admin/incidents` (+ `stats`), `/admin/requests/overtime`, handover/request inboxes and direct identifiers in `apps/api/src/{shift,incidents,requests,handover}/**/*.test.ts` (covers AC-001, AC-002)
- [ ] T003 [US1] Apply grant scope predicates in the shift, incident and overtime services using `packages/domain/src/access/scope.ts`; 403 for out-of-scope identifiers (covers AC-001, AC-002)
- [ ] T004 [US1] Tag change events with site/unit/zone in `apps/api/src/shift/shift-changes.ts` publishers and filter each SSE subscriber by grant in the four admin controllers, with a subscriber test (covers AC-003)
- [ ] T005 [US1] Independent review of the access boundary; record result and deployed verification in the engineering memory (covers AC-001–AC-003)

## User Story 2: Shift context and scope selector (P1)

**Outcome**: header names site/unit and current shift | **Acceptance criteria**: AC-004–AC-008

- [ ] T006 [US2] Add `packages/domain/src/time/shift-window.ts` with unit and fast-check tests for day, night business date, post-shift grace and DST (covers AC-004–AC-007)
- [ ] T007 [US2] Add `packages/contracts/src/overview.ts` context contract and `GET /admin/overview/context` in new `apps/api/src/overview/` module returning granted options and per-site windows (covers AC-004, AC-007)
- [ ] T008 [US2] Add scope selection to the overview UI store and pass it to destination presets in `apps/admin-web/src/features/overview/model/destination.ts` with tests (covers AC-008)
- [ ] T009 [US2] Build the header (selector, shift context with ticking remaining time, freshness, help button opening the existing guide in a Sheet) in `apps/admin-web/src/features/overview/ui/` with i18n in `packages/i18n/src/{uk,en,ru}.ts` (covers AC-004–AC-007, AC-027)

## User Story 3: Prioritized action queue (P1)

**Outcome**: tiered queue with age/deadline, no zero cards | **Acceptance criteria**: AC-009–AC-013

- [ ] T010 [US3] Add pure `apps/admin-web/src/features/overview/model/priority.ts` (tiers D-08, age/deadline ordering, checked/unknown summary, setup separation) with tests (covers AC-009–AC-012)
- [ ] T011 [US3] Replace the tile grids with the action queue, all-clear/unknown line and setup section; remove the zero card and duplicate hint in `apps/admin-web/src/overview/OverviewPage.tsx` → `features/overview/ui/`; keep existing destination click tests green (covers AC-009–AC-013, AC-027)

## User Story 4: Shift health KPIs (P1)

**Outcome**: staffing, time to action, downtime, handover for the current shift | **Acceptance criteria**: AC-014–AC-019

- [ ] T012 [US4] Add pure `packages/domain/src/overview/{staffing,downtime,time-to-action,handover-acceptance}.ts` with AC fixtures (covers AC-014–AC-018)
- [ ] T013 [US4] Add `GET /admin/overview/health` (scoped, read-only, one snapshot transaction, per-source availability) with an integration test on seeded data; check query plans (covers AC-014–AC-019)
- [ ] T014 [US4] Extract a shared KPI tile from local Reports/Bonus/Overview tiles and render four KPIs with tooltips, `n/m`, details, destinations and loading/failure states (covers AC-014–AC-019)

## User Story 5: Terminal connectivity (P1)

**Outcome**: offline kiosks surface before arrivals fail | **Acceptance criteria**: AC-020–AC-021

- [ ] T015 [US5] Add pure `packages/domain/src/overview/terminal-connectivity.ts` (D-04) with tests and expose connectivity in the overview context/health contract (covers AC-020, AC-021)
- [ ] T016 [US5] Add offline terminal items to the action queue and unpaired terminals to setup, linking to Administration / Terminals (covers AC-020, AC-021)

## User Story 6: Zone board (P2)

**Outcome**: per-zone live status | **Acceptance criteria**: AC-022–AC-023

- [ ] T017 [US6] Add pure `packages/domain/src/overview/zone-status.ts` and `GET /admin/overview/zones` with tests (covers AC-022)
- [ ] T018 [US6] Render the zone board with problem-first ordering, collapsed idle zones and mobile list layout (covers AC-022, AC-023)

## User Story 7: Live freshness (P2)

**Outcome**: changes visible within 5 s | **Acceptance criteria**: AC-024

- [ ] T019 [US7] Subscribe Overview to the scoped streams through `apps/admin-web/src/lib/live.ts`, invalidate list and overview keys, show live/offline freshness, keep 60 s fallback, with a component test (covers AC-024; depends on T004)

## User Story 8: Operational event feed (P3)

**Outcome**: scoped recent operational events | **Acceptance criteria**: AC-025–AC-026

- [ ] T020 [US8] Confirm the Lean gate from the moderated check before starting; record the decision (covers AC-025)
- [ ] T021 [US8] Add `GET /admin/overview/events` with the D-10 allowlist, zone→unit→site scope join and an integration test that excludes request/medical/out-of-scope events (covers AC-026)
- [ ] T022 [US8] Render the feed with live append preserving scroll and focus, record links and i18n (covers AC-025)

## User Story 9: Acceptance and documentation (P2)

**Outcome**: verified role compositions and docs | **Acceptance criteria**: AC-027–AC-028, SC-001–SC-004

- [ ] T023 [US9] Implement D-09 role composition in the page view model with tests for each role (covers AC-028)
- [ ] T024 [US9] Capture and inspect 1440×900 and 390×844 screenshots per role and locale; run the moderated check and compare with T001 (covers AC-028, SC-001, SC-004)

## Delivery and Evidence

- [ ] T025 Update `docs/features/11-admin-panel.md` Overview section and `docs/engineering/features/overview.md` with final decisions, Lean result, checks and limitations
- [ ] T026 Inspect task-owned changes, run required checks from plan.md, deliver through the master CI/release path per increment

## Dependencies and Handoff

T002–T005 block T007, T013, T017, T019, T021 (any scoped selector or new endpoint). T006 blocks T007
and T009. T010 blocks T011, T016. T012 blocks T013 blocks T014. T015 blocks T016. T017 blocks T018.
T024 depends on all shipped stories; T020 gates T021–T022.

| GitHub issue scope         | Tasks           |
| -------------------------- | --------------- |
| Access boundaries          | T002–T005       |
| Shift context and selector | T006–T009       |
| Action queue               | T001, T010–T011 |
| Shift health               | T012–T014       |
| Terminal connectivity      | T015–T016       |
| Zone board                 | T017–T018       |
| Live freshness             | T019            |
| Event feed                 | T020–T022       |
| Rollout and acceptance     | T023–T026       |

## Convergence

After implementation compare code with spec and plan; append demonstrated in-scope gaps as T027+.
