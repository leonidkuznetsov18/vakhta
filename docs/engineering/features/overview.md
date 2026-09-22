# Overview attention queues

Updated: 2026-09-10. Owner request: audit every card and ensure pending master decisions are visible
before their deadline. The supplied example has six submitted checklists before 22:00 but a zero card.

## Rules and destinations

Counts use the same eligible records for people, first row and business date. Every API enforces the
signed-in user's scope; the panel only requests queues available to their roles.

| Card                                 | Eligibility                                                               | Destination                                                          |
| ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Checklists without a master decision | SUBMITTED or DISPUTED, any submission date, including before the deadline | Pending handovers; clear date, site and search; open first report    |
| Open incidents                       | Domain open statuses                                                      | Open incidents, all time; clear site/search; open first incident     |
| SLA breached                         | Open incident, SLA breached, no acknowledgedAt or resolvedAt              | Open incidents, all time; open first unanswered breach               |
| Requests at my step                  | Open requests returned by the role-filtered inbox                         | Inbox; clear search; open first request                              |
| Overdue requests                     | Same inbox, overdue=true                                                  | Inbox; open first overdue request                                    |
| Overtime awaiting decision           | PENDING only                                                              | Inbox; open first overtime shift                                     |
| Telegram not activated               | ACTIVE employee without Telegram link                                     | Active/unlinked employee filter; clear search                        |
| Terminals not paired                 | ACTIVE terminal, paired=false                                             | Administration / terminals; clear search                             |
| Unscheduled shifts                   | No assignment, endedAt=null, active domain state                          | Existing unit/month/person schedule preset                           |
| Closed without checklist in 24h      | Ended shift with autoCloseReason=NO_CHECKLIST in API's rolling 24h window | Operations ALL; first record's business date; clear site/unit/search |
| In downtime                          | endedAt=null and DOWNTIME                                                 | Operations OPEN/DOWNTIME; first record's business date               |
| On shift                             | endedAt=null and active domain state                                      | Operations OPEN; first record's business date                        |

Operations has a day filter, so its destination opens the first counted business date; the overview
can include open shifts from multiple business dates. Incident and request destinations retain the
complete open/inbox queue and expand the matching record, rather than adding bespoke filter modes.
Normal pending checklists use amber attention styling; this card does not assert an SLA breach.

## Implementation

`features/overview/model/attention.ts` owns pure eligibility and prepared data, `queries.ts` subscribes
to existing list query keys, and `destination.ts` prepares destination filters without modifying drafts.
The former aggregate query could stay stale after another page invalidated its own list. Shared keys
now update the overview and sidebar on those invalidations, with the existing 60-second polling fallback.
Failed or unavailable sources stay unknown, not zero. Cached results survive a refresh failure with
visible retry feedback; all-clear requires every eligible source to be complete. Authentication and
role checks prevent disabled queries from exposing an earlier cached queue.

The requests inbox previously limited to 500 rows before role filtering. An older request eligible
for a master could disappear behind 501 newer requests assigned to HR. The actionable inbox now
filters the complete open queue; historical browsing keeps its existing 500-row cap. This preserves
role-step filtering and medical-document masking. A future paginated server-side count endpoint may
reduce transfers for much larger queues; do not reintroduce a cap before authorization filtering.

Navigation now writes the final tab/row after the app's section navigation. This avoids resetting
`administration/terminals` to the default employee tab. Telegram username draft state has a separate
key from the linked/unlinked employee filter.

## Evidence and Lean decision

- 14 pure regression cases cover all card eligibility, unknown/empty data and destination presets.
- 8 query/component cases cover six pre-deadline reports, immediate shared-cache updates, source
  failure, HR and unauthenticated permissions, all-clear suppression, and actual report/terminal clicks.
- Two focused PostgreSQL inbox tests pass, including the 501-newer-record role-filter regression.
- Panel/API typechecks pass. Changed-file lint and formatting are checked before delivery.
- Real Overview components inspected in browser at 1440x1000 and 390x844 with six synthetic submitted
  reports. Pending work appears immediately; mobile labels wrap and document width equals viewport.
- Independent access-boundary review found the route-reset bug, now fixed and protected by click tests.

Lean: proceed. Surface work when it becomes actionable, preserve ownership and remove repeated filter
clearing. Distinguish a waiting decision from a breached deadline to avoid false urgency. No new worker
input or production employee actions are needed for this correction. Live release evidence follows CI.

Production confirmation: v0.73.7 on panel.vakhta.xyz shows six pending master decisions and a matching
sidebar badge. Clicking the card opens the first report under /handover with exactly six submitted
reports in the resulting queue. Desktop screenshot captured and inspected. No reports were changed.

## Redesign: command center (spec 004)

Updated: 2026-09-13. Specification, plan and tasks: `specs/004-overview-command-center/`. Product
document: `docs/features/overview-command-center.md`. Epic #55; children #56–#63 delivered, #64 open for
the participant acceptance check.

### Ownership

- Access: `packages/domain/src/access/scope.ts` (`accessScope`, `scopeCovers`) and
  `apps/api/src/common/access-scope.ts` (`scopeCondition`, `assertInScope`, `assertFiltersInScope`,
  `scopedEvents`). Shift, incident, request/overtime and handover controllers pass the reader scope;
  services default to `FULL_SCOPE` only for bot/job callers.
- Facts: pure `packages/domain/src/time/shift-window.ts` and `packages/domain/src/overview/*`
  (staffing, zone-minute downtime, time to action, handover acceptance, terminal connectivity, zone
  status). `apps/api/src/overview` reads one repeatable-read snapshot (`GET /admin/overview`) and the
  allowlisted events (`GET /admin/overview/events`); each section uses the roles of its source and is
  null when unreadable.
- Panel: `features/overview/model` (attention lists with ages/deadlines, `priority.ts` queue and
  composition, `snapshot.ts` queries and remembered selection) and `features/overview/ui` (header,
  card queue, KPI tiles via shared `components/app/kpi-tile.tsx`, zone board, event feed, setup).
  `lib/live.ts` accepts extra keys so one stream invalidates its list and the snapshot. The schedule
  attention endpoint feeds the Overview-owned `TeamToday` section for the resolved sites.

### Decisions and deviations

- D-01–D-10 shipped with the spec defaults: late grace SHIFT_GRACE_MINUTES (10), closing grace
  AUTO_CLOSE_GRACE_MINUTES (120), offline after 3 × QR_ROTATION_SECONDS, critical within 60 minutes of a
  boundary or with not-arrived staff, zone downtime critical after DOWNTIME_ESCALATION_MINUTES.
- One snapshot endpoint instead of separate context/health/zones endpoints: one transaction gives
  consistent figures and one cache key.
- Terminal online/offline is derived, not a recorded event, so it is a queue card, not a feed row.
- Queue cards from section lists (incidents, handovers, requests, overtime, closed without checklist)
  count the whole grant scope; the selection narrows snapshot figures and destination filters.
- Owner feedback 2026-09-13: queue, zones and setup render as compact card grids, not long rows.
- Owner feedback 2026-09-13: the schedule attention block is an Overview-owned section "Люди і графік
  сьогодні" (`features/overview/model/team-today.ts`, `ui/team-today.tsx`) reading
  `/admin/schedules/staffing/attention` per site: sick leave with wellbeing (worse/unanswered first),
  unfilled shifts grouped by date with zone and unit, birthdays; holiday in the header. The schedule
  slice's former `ScheduleAttentionCard` was unmounted and removed in the 2026-09-13 cleanup;
  the active Overview query, endpoint and presentation remain unchanged.
- User-visible access change: SITE grants are limited to their site; ENTERPRISE HR/AUDITOR now read
  handover lists; out-of-scope identifiers and filters are 403.
- Handover acceptance uses sessions whose planned end lies within two hours of the shift start.

### Evidence (local, 2026-09-13)

- API, PostgreSQL 16 testcontainers: `common/access-scope.test.ts` 5, `overview/overview.service.test.ts`
  5, handover/incidents/requests/shift/app.e2e regressions 91 passed. Independent access review: four
  defects found and fixed (see #56).
- Domain: shift window 6 (incl. DST and a fast-check property), overview metrics 12, access 10.
- Panel: overview queries/page 12, priority 4, attention 14, live invalidation 1; full panel suite 362 of
  363 passed, the failure belongs to concurrent schedule work.
- Screenshots (preview fixtures, desktop 1440 and mobile 390 via iframe; headless Chrome cannot size a
  window below ~500 px): `docs/engineering/evidence/overview-2026-09-13/`, inspected: full page, first
  viewport, all clear, snapshot failure, unit master, English, mobile first viewport and full page.
- Commits: 13631b9/27109dd (scope work swept into schedule commits by a parallel session), 2f279cc,
  64560d7, 75e2731 and the documentation delivery. CI on 2f279cc failed only in semantic-release on a
  duplicate tag from concurrent pushes.

### Lean result and remaining work

- Recommendation stays **Simplify, then proceed**. Built from existing facts; no new worker input.
- Not measured: SC-001/SC-004 moderated check with a real shift master and production head on the same
  synthetic tasks, and the Lean gate for the event feed. No participant session was available; #64 stays
  open for it. Do not infer the improvement from screenshots.
- Not verified on the deployed panel with a live account in this session (preview fixtures only).
- Follow-ups: migrate Reports/Bonus local tiles to `KpiTile`; narrow list-based queue cards by the
  selection when their views carry a place; SSE scope refresh after grant revocation.

## 2026-09-13 — Page-owned planning handoff

The Overview feature now emits an `OverviewPlanningTarget`; `pages/overview` composes it with
Schedule's public preset writer and existing navigation. The actor, selected-unit cohort, source
order and first-person month are unchanged; preset state is written before navigation. The legacy
forwarding page was removed and its integration tests now belong to the page. No rendered content
or workflow changed. Verification and limits: [cleanup delivery](../../audits/2026-09-13/code-simplification-review.md).

## 2026-09-22 — Faces behind every people count

Owner rule: a count of people is not information without the people. Every people count on the
Overview carries an `AvatarStack` whose tooltip lists full names (`PeopleLine` in
`components/app/avatar-stack.tsx`). The snapshot now names them: `staffing.presentPeople` and
`expectedPeople` (domain `staffingSnapshot` returns `presentEmployeeIds`/`expectedEmployeeIds`, one
face per person), and each zone carries `presentPeople` (open shift in the zone) and `missingPeople`
(planned in the zone now, no open shift there). Photos come from the employee roster when the reader
may list employees; otherwise the initials placeholder. Zone cards use the overlay-button pattern of
`KpiTile`, so stacks are not nested inside a `<button>`. Evidence: domain, API (testcontainers) and
page tests; preview screenshots at 1440 px and 375 px, tooltips checked by hover.
