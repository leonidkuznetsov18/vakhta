# Feature Specification: Overview command center redesign

**Change**: 004-overview-command-center | **Created**: 2026-09-13 | **Status**: Draft — accepted for issue publication, not yet for implementation
**Baseline**: 0d4da70 | **Checkout**: master | **Authority**: Owner request 2026-09-13: detailed review and redesign of the Overview page; publish the specification and a new GitHub epic with child issues. Implementation is not yet authorized.
**Product document**: [01-overview](../../docs/features/01-overview.md), [admin panel](../../docs/features/11-admin-panel.md) (Overview section)
**Engineering memory**: [Overview attention queues](../../docs/engineering/features/overview.md)

## RECON: Current Behavior

**Actors.** Shift master (`SHIFT_MASTER`), production head (`PRODUCTION_HEAD`) and administrator
(`ADMIN`) open Overview many times per shift. HR, planners and cleanliness controllers see a subset.
Accountants and auditors currently get an almost empty page.

**Implementation.** `apps/admin-web/src/overview/OverviewPage.tsx` renders the page; pure eligibility
and destinations live in `apps/admin-web/src/features/overview/model/{attention,queries,destination}.ts`.
`useAttention` runs seven role-gated list queries (`/admin/shifts?scope=ALL`, `/admin/incidents?scope=open`,
`/admin/handovers?scope=pending`, `/admin/requests?scope=inbox`, `/admin/requests/overtime?scope=pending`,
`/admin/employees`, `/admin/org`) and polls every 60 s. The same hook feeds sidebar badges.

**Page layout today.**

1. `HowItWorks` accordion (collapsed, but occupies a row on every visit).
2. "Needs attention" card: a grid of 12 possible count tiles (`slaBreached`, `openIncidents`,
   `pendingHandovers`, `overdueRequests`, `requestsForMe`, `overtimePending`, `unlinkedEmployees`,
   `unpairedTerminals`, `unscheduled` per unit, `closedNoChecklist`, `inDowntime`, `onShift`); a tile
   appears only when its count is above zero and its tone is not neutral.
3. "Operations" card: every tile whose count is zero plus `onShift` — a wall of identical `0` cards.
4. A duplicate hint footer.

Proven qualities to preserve (see engineering memory): unknown ≠ zero, no false all-clear, shared list
query keys update Overview immediately after other pages mutate, and each card opens the first eligible
record with conflicting destination filters cleared.

**Observed problems.**

| #   | Problem                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Zero tiles carry no meaning: "0 in downtime" can mean healthy, nobody scheduled, or a broken scan.                                                                                                                                                                                          | `OverviewPage.tsx:317-321` renders all zero tiles in a second card.                                                                                                                                   |
| P2  | No shift context: the page does not say which shift (day/night), business date, time left, or post-shift grace is in effect.                                                                                                                                                                | No domain helper or endpoint computes the current shift window; `shift_templates`, `sites.timezone`, `planInstants`, `businessDateOf` exist.                                                          |
| P3  | No health metrics: planned vs present staff, time to action on incidents, downtime and handover quality are absent, although the product KPIs (`docs/product-vision.md` §6) are exactly these.                                                                                              | No planned-vs-actual endpoint; `GET /admin/incidents/stats`, `shift_assignments`, `presence_sessions`, `activity_intervals`, `handover` statuses exist.                                               |
| P4  | Flat priority: a breached safety SLA, 93 unlinked Telegram accounts and a pending overtime approval look like peers in one grid. Tiles show counts but not age of the oldest item or time to deadline.                                                                                      | `TILES` tone is static per key.                                                                                                                                                                       |
| P5  | Setup/onboarding debt (Telegram activation, unpaired terminals) competes with live production problems.                                                                                                                                                                                     | Same grid.                                                                                                                                                                                            |
| P6  | Terminal risk is "not paired" only; a paired kiosk that stopped showing QR codes is invisible, although `qr_terminals.lastSeenAt` is updated on every QR challenge (`kiosk.service.ts:122`, rotation 45 s by default).                                                                      | `attention.ts` uses `paired`.                                                                                                                                                                         |
| P7  | Freshness: Overview polls every 60 s while Operations/Incidents/Handover/Requests use SSE (`lib/live.ts`); FR-WEB-01 expects an event in the panel within 5 s.                                                                                                                              | `queries.ts` `refetchInterval: 60_000`.                                                                                                                                                               |
| P8  | **Access boundary.** `/admin/shifts`, `/admin/incidents`, `/admin/requests/overtime`, `/admin/audit/events` and all four SSE streams filter by role only, not by the grant scope. A site/unit selector or event feed built on them would expose other units to an `ORG_UNIT`-scoped master. | `shift.service.ts:237-294`, incident and audit services; `shift-changes.ts` is an unfiltered in-process `Subject`. Requirement 1 in `docs/engineering/features/critical-reliability.md` remains open. |
| P9  | No page-level help affordance other than the accordion; no role-specific composition.                                                                                                                                                                                                       | `OverviewPage.tsx:295`.                                                                                                                                                                               |

## SPEC: Outcome and Boundaries

**Mission.** Overview becomes the exception-based action center for the current shift. Within one
glance of the first viewport the master or administrator can answer:

1. **What needs my action now?** — prioritized by severity, age and deadline.
2. **What is the state of the shift right now?** — staffing against the plan, zones in downtime,
   terminals able to record attendance.
3. **Is the shift at risk of closing badly?** — pending handover decisions, not-arrived staff,
   unanswered incidents, reports still missing before the grace deadline.

**Target layout** (desktop, top to bottom; mobile keeps the same order in one column):

```text
┌ Header ─────────────────────────────────────────────────────────────────────────┐
│ Overview   [Site: Plant 1 ▾] [Unit: All ▾]        ● Live · updated 11:42    (?) │
│ DAY SHIFT 08:00–20:00 · business date 13.09 · 3 h 15 min left                    │
├ Needs action now ───────────────────────────────────────────────────────────────┤
│ CRITICAL  1 incident SLA breached · oldest 18 min · Zone Lathe 2         →       │
│ CRITICAL  1 terminal offline · Gate 1 · last seen 6 min ago              →       │
│ WARNING   6 checklists await master decision · oldest 3 h                →       │
│ WARNING   2 staff not arrived · planned 08:00                            →       │
│ ✓ All clear: overdue requests, closed without checklist        ⚠ 1 source unknown │
├ Shift health (current shift, selected scope) ───────────────────────────────────┤
│ Staffing 42/44 planned │ Time to action median 4 min, SLA met 5/6 │            │
│ Downtime 45 zone-min, 2 incidents, top: pneumatics │ Handover 49/50 accepted     │
├ Zones now ──────────────────────────────────────────────────────────────────────┤
│ Lathe 2   ● DOWNTIME 32 min  2/2 people │ Packing ● WORKING 3/3 │ Press ○ 0/1 … │
├ Recent operational events (live) ───────────────────────────────────────────────┤
│ 11:45 Downtime started · Lathe 2 · Pneumatics failure · O. Ivanov                │
│ 11:42 Checklist accepted · Packing · master V. Petrov                            │
├ Setup and onboarding (not blocking this shift) ─────────────────────────────────┤
│ 93 employees without Telegram · 1 terminal not paired · 2 units unscheduled      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Changes relative to the owner's draft** (accepted into this spec):

- The site/unit selector and the event feed are gated on server-side scope enforcement (P8); without
  it they would be a UI filter over data the user must not see.
- "Time to action" is added as a first-class KPI: it is the product's primary lever
  (`product-vision.md` §6) and was missing from the draft.
- Downtime is reported in **zone-minutes** (overlapping personal `DOWNTIME` intervals in one zone are
  merged), with person-minutes as secondary detail. Summing personal intervals would double-count
  when two workers stand at one stopped machine. No OEE/availability percentage (out of MVP scope).
- "Checklist success 98%" becomes **handover acceptance** with explicit numerator/denominator
  (`49/50`); percentages alone mislead on small samples. It maps to the "fewer disputes" KPI.
- "0 terminals offline" uses the existing heartbeat `lastSeenAt`, not pairing; unpaired terminals move
  to setup.
- "Not arrived" is not labelled "no-show": no absence detection exists and approved absences must
  be excluded. It is a factual "planned, grace passed, no presence recorded".
- A **zone board** is added: it answers "state of production now" per workplace rather than per
  person, which is what a master acts on.
- The event feed is limited to an allowlist of operational events that link to a record; it is not
  the audit log and is delivered last.
- The help accordion becomes a `(?)` button that opens the existing guide in a sheet.

**Scope.** Overview page UI; supporting read-only API contracts and pure domain calculations; scope
enforcement of the data sources this page uses; i18n in `uk`, `en`, `ru`; product and engineering docs.

**Non-goals.** OEE, output, equipment states, availability percentages; changing shift FSM, incident,
handover or request behavior; app-wide global scope switcher for every page (the Overview selector
passes its selection to destinations only); new worker input or bot changes; notifications/escalation
changes; skeleton loaders; historical dashboards/trends beyond the current and previous shift;
AI-generated insights.

**Compatibility.** Existing card destinations, filter presets and sidebar badges keep working. Shared
list query keys remain the invalidation source for queue counts. No migration of recorded history.
Any new endpoint is read-only and additive.

### Decisions and defaults

Defaults proposed by this spec. The owner may revise each without data loss; implementation must
record the final value in the engineering memory.

| ID   | Decision                 | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | Scope selector ownership | Overview-local site and unit selector, limited to the user's grants, defaulting to the narrowest grant (single site/unit preselected), persisted per user in the UI store. Destinations receive the selection as filters. Not an app-wide context.                                                                                                                                                                                                                       |
| D-02 | Current shift window     | Derived per site from active `shift_templates` and `sites.timezone` at `now`. The owner-approved two-hour post-shift grace (22:00 / 10:00) is shown as "closing previous shift" while the new shift is running. With several sites and "All sites", show one compact context line per site.                                                                                                                                                                              |
| D-03 | Staffing                 | Denominator: `PLANNED` assignments whose planned interval overlaps the current shift window in scope, minus approved absences. Present: linked shift session or open presence. Not arrived: plan start + existing late grace passed and no presence. Expected: plan start not yet reached. Present without assignment is shown separately (unscheduled).                                                                                                                 |
| D-04 | Terminal offline         | ACTIVE, paired terminal whose `lastSeenAt` is older than 3 × `rotationSeconds` (135 s at the default 45 s). Critical when the terminal's site has a shift boundary within 60 minutes or staff not arrived; warning otherwise.                                                                                                                                                                                                                                            |
| D-05 | Downtime                 | Zone-minutes: union of `DOWNTIME` activity intervals per zone clipped to the shift window, open intervals counted to `now`; person-minutes and incident count as detail; top reason by zone-minutes.                                                                                                                                                                                                                                                                     |
| D-06 | Time to action           | Median minutes from incident report to acknowledgement for incidents reported in the window; SLA met = acknowledged before `slaDueAt`. Unacknowledged open incidents are shown as running, not excluded silently.                                                                                                                                                                                                                                                        |
| D-07 | Handover acceptance      | Handover reports into the current shift: accepted without dispute / decided (accepted + disputed + resolved). Pending reports are shown separately. Percent is secondary to `n/m`.                                                                                                                                                                                                                                                                                       |
| D-08 | Priority tiers           | Critical: unacknowledged SLA breach, safety-reason open incident, offline terminal per D-04, zone in downtime longer than its escalation threshold. Warning: open incidents, pending checklist decisions, not-arrived staff, overdue requests, closed without checklist (24 h). Info: my requests, pending overtime. Setup (separate section): Telegram not activated, terminals not paired, unscheduled units/shifts. Within a tier, sort by deadline, then oldest age. |
| D-09 | Role composition         | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER: all sections. CLEANLINESS_CONTROLLER: action queue (handover items), handover KPI, zones. HR: requests, not-arrived staff, setup (Telegram). PLANNER: staffing KPI, unscheduled/setup. ACCOUNTANT, AUDITOR: shift context and a short list of links to their sections; no empty cards. A section is rendered only when every source it needs is permitted.                                                                         |
| D-10 | Event feed               | Allowlist: incident reported/acknowledged/escalated/resolved, SLA breached, downtime started/ended, handover submitted/disputed/decided, terminal offline/online, master-closed shift. Scoped by zone → unit → site. Latest 30, live via SSE. Request and medical content never appears.                                                                                                                                                                                 |

## User Scenarios and Testing

### US1: Scoped data for the command center (Priority: P1, prerequisite)

A master with an `ORG_UNIT` grant sees only their unit on Overview and in its destinations and live
streams; an administrator with `ENTERPRISE` scope can select any site/unit.

**Acceptance scenarios**:

- **AC-001**: Given a master scoped to unit A and open shifts, incidents and overtime in units A and B,
  when Overview and its sources load, then counts, avatars, first-record links and SSE events include
  only unit A.
- **AC-002**: Given a `SITE`-scoped user, when they request another site's data by identifier or query
  parameter, then the API returns no foreign records (403 for direct identifiers), not an empty
  success masquerading as zero in the UI.
- **AC-003**: Given an SSE subscriber scoped to unit A, when a unit B shift changes, then no unit B
  event payload is delivered to that subscriber.

### US2: Shift context and scope selector (Priority: P1)

The user immediately sees which site/unit and which shift the page describes.

**Acceptance scenarios**:

- **AC-004**: Given site time zone Europe/Kyiv and now 11:45 local, when Overview opens, then the header
  shows the day shift 08:00–20:00, business date and "8 h 15 min left", formatted with units.
- **AC-005**: Given now 01:30 local, then the night shift 20:00–08:00 of the previous calendar date is
  shown with the previous date as business date.
- **AC-006**: Given now 21:10, then the night shift is current and a "closing day shift until 22:00"
  indicator shows pending closure risks for the day shift.
- **AC-007**: Given a user with grants to one unit, then the selector is preselected and cannot choose
  other units; given DST change night, then remaining time is computed from instants, not wall clock.
- **AC-008**: Given a selection, when a card or KPI is opened, then the destination applies the same
  site/unit filter and clears conflicting filters as today.

### US3: Prioritized action queue (Priority: P1)

The master sees what to do first, how old it is and when it breaches.

**Acceptance scenarios**:

- **AC-009**: Given one unacknowledged SLA breach, six pending checklists and 93 unlinked employees,
  then the SLA item is first in the critical tier, checklists are in warning with the age of the oldest
  report, and the Telegram count appears only in the setup section.
- **AC-010**: Given every source loaded with zero items, then one "All clear" line lists what was
  checked; no zero cards are rendered.
- **AC-011**: Given one source failed, then the line shows that source as unknown with retry, and no
  all-clear is claimed for it; cached counts from other sources remain visible.
- **AC-012**: Given an item with a deadline, then the remaining time or overdue duration is shown with a
  text label and icon, not color alone, and updates without reload.
- **AC-013**: Given the existing destination behavior, when an item is clicked, then the first
  eligible record opens exactly as in the current attention queue tests.

### US4: Shift health KPIs (Priority: P1)

The master and production head see whether the current shift is healthy against recorded facts.

**Acceptance scenarios**:

- **AC-014**: Given 44 planned assignments, 1 approved absence, 40 present, 2 with grace passed and no
  presence, 1 not yet due, and 1 unscheduled present worker, then staffing shows `40/43` present,
  `2 not arrived`, `1 expected`, `+1 unscheduled`, and clicking "not arrived" opens the matching people.
- **AC-015**: Given two workers in `DOWNTIME` in the same zone 10:00–10:30 and one open interval in
  another zone since 11:30 at now 11:45, then downtime shows 45 zone-minutes, 75 person-minutes in
  detail, and the incident count.
- **AC-016**: Given incidents acknowledged after 2, 4 and 12 minutes and one unacknowledged, then time
  to action shows median 4 min, SLA met per D-06 and "1 awaiting reaction".
- **AC-017**: Given 50 decided handovers into this shift, 49 accepted without dispute, 3 pending, then
  handover shows `49/50` and `3 pending`.
- **AC-018**: Given no planned assignments in scope, then staffing reads "no plan for this shift" with a
  link to Schedule, not `0/0` or `0%`.
- **AC-019**: Given a KPI source is loading or failed, then that KPI shows the shared loader or failure
  with retry, never a zero.

### US5: Terminal connectivity (Priority: P1)

The administrator learns that attendance cannot be recorded before workers arrive at a dead kiosk.

**Acceptance scenarios**:

- **AC-020**: Given an active paired terminal last seen 6 minutes ago with rotation 45 s, then it is
  reported offline with "last seen 6 min ago" and the tier from D-04; a terminal seen 60 s ago is online.
- **AC-021**: Given a disabled or unpaired terminal, then it never counts as offline; unpaired terminals
  appear in setup.

### US6: Zone board (Priority: P2)

The master sees each zone's live status and staffing at once and opens the zone's shifts.

**Acceptance scenarios**:

- **AC-022**: Given zones with downtime, full staffing, a planned but empty zone and an unplanned zone,
  then problem zones sort first with status text, duration and `present/planned`, and unplanned idle
  zones are collapsed under a count.
- **AC-023**: Given 390 px width, then zones render as a bounded list without horizontal page scroll.

### US7: Live freshness (Priority: P2)

- **AC-024**: Given scoped SSE streams, when a shift, incident, handover or request changes in scope,
  then Overview reflects it within 5 s; when the stream drops, the header shows offline/paused and the
  60 s polling fallback continues with a visible last-updated time.

### US8: Operational event feed (Priority: P3)

- **AC-025**: Given allowlisted events in scope, then the latest 30 appear newest first with local time,
  zone, actor and a link to the record; new events arrive live without resetting scroll or focus.
- **AC-026**: Given a request, medical document or out-of-scope event, then it never appears in the
  feed payload.

### US9: Page hygiene and acceptance (Priority: P2)

- **AC-027**: The help accordion and duplicate footer hint are replaced by a `(?)` button opening the
  existing guide; every KPI and tier has an i18n tooltip in three languages.
- **AC-028**: At 1440×900 the header, action queue and shift health fit the first viewport with a
  typical load; at 390×844 the action queue is first after the header. Screenshots are captured and
  inspected for each role composition in D-09.

### Edge Cases

- Several sites in different time zones selected together (D-02 per-site context lines).
- Shift boundary crossing while the page is open: context, KPIs and queues roll over without reload;
  previous-shift closure risks remain visible during grace.
- Night shift business date; DST transitions; custom assignment hours and segments (planned interval
  overlap, not template name, decides staffing membership; segment zone decides zone board placement).
- Worker present in a different zone than planned; borrowed worker from another unit (counts in the
  zone where the session is, flagged in detail).
- Very large counts and long zone/person names (TextPreview, bounded widths).
- Sources permitted for some roles only: a KPI needing a forbidden source is hidden, not zero.
- Session switch between users: no cached Overview data of the previous user is rendered.
- Not applicable: worker bot and kiosk surfaces are unchanged; no money or bonus calculation changes.

## Requirements

### Functional Requirements

- **FR-001**: Overview data sources (`/admin/shifts`, `/admin/incidents`, `/admin/handovers`,
  `/admin/requests` inbox, `/admin/requests/overtime`, new overview endpoints) and their SSE streams
  MUST apply role and scope from the same grant. Verified by AC-001–003.
- **FR-002**: A pure domain function MUST compute the current and grace-period shift window per site
  from templates, time zone and instant. Verified by AC-004–007.
- **FR-003**: Overview MUST provide a site/unit selector limited to granted scope that propagates to
  destinations. Verified by AC-007–008.
- **FR-004**: The action queue MUST order items by tier (D-08), deadline and age, hide zero items, and
  summarize checked and unknown sources. Verified by AC-009–013.
- **FR-005**: Setup/onboarding counts MUST render in a separate non-blocking section. Verified by AC-009, AC-021.
- **FR-006**: A read-only shift health contract MUST return staffing, time to action, downtime and
  handover metrics per D-03, D-05–D-07 with explicit numerators/denominators and unknown states.
  Verified by AC-014–019.
- **FR-007**: Terminal connectivity MUST be derived from `lastSeenAt` per D-04. Verified by AC-020–021.
- **FR-008**: A zone board MUST show per-zone status, duration and present/planned staff. Verified by AC-022–023.
- **FR-009**: Overview MUST use scoped live updates with polling fallback and a visible freshness state.
  Verified by AC-024.
- **FR-010**: An operational event feed MUST return only allowlisted, scoped events. Verified by AC-025–026.
- **FR-011**: All user-facing strings, tooltips and units MUST be in `@vakhta/i18n` (`uk`, `en`, `ru`);
  durations use `formatDuration`. Verified by AC-012, AC-027.
- **FR-012**: Every async surface MUST distinguish initial loading, refresh, offline, failure with retry,
  empty success; loaders use `shared/ui/loading-state.tsx`. Verified by AC-011, AC-019, AC-024.

### Key Entities

- **Shift window** (new, derived): site, template, kind (day/night), business date, `startsAt`,
  `endsAt`, grace `closesAt`, phase (`RUNNING`, `CLOSING_PREVIOUS`).
- **Shift health snapshot** (new read model, not persisted): scope, window, staffing counts with
  people identifiers, downtime zone-minutes/person-minutes/incidents/top reason, time to action,
  handover counts, per-source availability, `generatedAt`.
- **Zone status** (new read model): zone, unit, derived status, since, present/planned.
- **Terminal connectivity** (derived): terminal, `lastSeenAt`, online/offline.
- Existing: shift sessions, activity intervals, presence sessions, shift assignments, incidents,
  handover reports, requests, `domain_events` (definitions in `docs/product-vision.md` §4).

## Success Criteria

- **SC-001**: In a moderated check with a master and a production head on synthetic data, each answers
  the three mission questions from the first viewport without navigating away (AC-009, AC-014–017, AC-028).
- **SC-002**: No Overview number is rendered from unknown data: loading/failure states never display
  zero or all-clear (AC-011, AC-019).
- **SC-003**: No cross-scope record reaches a scoped user through Overview lists, counts, links or
  streams (AC-001–003, AC-026).
- **SC-004**: Baseline vs redesign on the same scenarios: clicks/pages visited before the master opens
  the right record for an SLA breach, a dead terminal and not-arrived staff are recorded; the redesign
  must not increase them.

## Verification Scope

Mixed risk under `docs/engineering/testing-baseline.md`:

- **Authorization (high risk)**: US1 needs PostgreSQL-backed scope invariant tests for lists, direct
  identifiers and SSE, plus one independent review of the boundary.
- **Time (high risk)**: shift window, grace, night business date and DST need pure property/unit tests.
- **Ordinary behavior**: KPI and zone calculations need pure domain tests (AC examples as fixtures);
  view models and components need focused Vitest tests of loading/failure/empty/priority states.
- **UI**: desktop 1440 and mobile 390 screenshots per D-09 role, captured and inspected, in all three
  locales for long labels. Worker bot and kiosk are unaffected; no bot/kiosk QA.
- Exact commands and evidence location are defined in `plan.md` and recorded in the engineering memory.
