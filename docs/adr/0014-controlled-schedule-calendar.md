# ADR 0014: Controlled resource calendar over the existing Schedule workspace

Date: 2026-09-13
Status: Accepted for the first rendering increment; full epic acceptance remains open
Related: [Schedule plan](../../specs/002-schedule-calendar-redesign/plan.md), issues #5/#6/#54

## Context

Schedule needs zone and employee projections over the same assignments, with readable day/week
views and a mobile day list. Its existing feature owns drafts, template interpretation, publication,
history and communication. A UI library must not become a second owner of those rules.

[The official-source comparison](../../specs/002-schedule-calendar-redesign/research.md) finds that
FullCalendar and Schedule-X resource features require commercial terms. React Big Calendar is MIT,
but its resource columns do not match the required roster rows. Installed TanStack Table 9.2.4 and
shadcn already supply the controlled, Compiler-compatible table/pagination primitives used here.

## Decision

Add a domain-independent `shared/ui/resource-calendar` renderer accepting readonly resources, dates,
localized items, optional visual parts, selection, contextual creation availability and a responsive Sheet
detail slot. It emits selected resource/date/item identities. It does not fetch, interpret time,
authorize, validate assignments or write drafts. `schedule-management/model/calendar.ts` prepares
views from the existing full grid and recorded instants. The feature adapter opens existing editors.

Paginate resources (20 by default), show up to three items per cell in every layout,
and expose overflow through a `N more` button counting only hidden assignments and a paginated Sheet. Mobile uses the same
model with a date strip and single-day resource list. The owner explicitly lifted prior component/palette and mandatory sub-row restrictions on 2026-09-13.
Sheet presentation keeps calendar geometry stable, returns focus to the opening control, and uses
full width on mobile. Indigo night and amber day cards retain text status labels. Month uses the established employee
D/N matrix and assignment Sheet; day/week retain zone/person grouping. No additional runtime dependency or application lifecycle hook is introduced.

## Evidence and limits

The isolated `preview.html?calendar=spike` fixture has 500 employees, 20 populated zones plus an empty
zone and 7,000 assignments across September/October. Captured and inspected 1440×900 and 390×844 views;
page width remained equal to viewport width. A pre-Sheet development-build CDP sample after the density change
measured zone-to-person switching at 31.326 ms script, 2.982 ms layout and 76.307 ms total task CPU;
the person/week view contained 1,296 DOM elements. These are one local diagnostic sample, not latency
percentiles, production/mobile-device performance, or a human pilot benchmark.

Keyboard Enter opens details and the date picker; an occupied target date produces an announced
conflict in the synthetic Move workflow. Production grouping preserves assignment identity/context;
its existing editor retains defaults and disables unchanged Apply. Focused model/workspace checks
cover projection parity, hidden metadata, recorded times, no-op actions and existing draft workflows.
Exact evolving check results live in the feature engineering memory.

Custom time/segment persistence, drag, eligibility, cross-month writes, full roster loading and
uncertain-write recovery remain assigned to their existing epic streams. Visual parts and cross-month
fixture dates do not establish production support. #5 stays open until its remaining demonstrations
and evidence pass; #54 retains human acceptance and pilot ownership. Revisit Virtual only if measured
production-scale interaction requires it; do not add it to replace current pagination speculatively.
