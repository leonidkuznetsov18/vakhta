# Incident diagnosis and knowledge history

Owner-approved behavior, 2026-09-10:

- A BREAKDOWN report requires a photo; its caption is optional. Other reasons retain their configured
  requirements. The bot blocks skip/stale stop callbacks and the service validates both Telegram IDs.
- Masters record `rootCause` and `resolution`, each trimmed and limited to 2,000 characters. Drafts
  can be saved independently of a status change. RESOLVED requires at least three characters in each
  field; saved drafts satisfy this requirement. Resolved/closed notes cannot be cleared through edits
  or closing. Unchanged historical resolved records may still close without invented diagnoses.
- Migration 0029 adds nullable columns to incidents and status history. Existing worker reports and
  comments remain readable. Updates and transitions append note snapshots, domain events and audits
  inside the incident row-lock transaction. Old text is not guessed into the new fields.
- The knowledge page uses the same authenticated list/detail/media endpoints and Query cache. It
  includes all statuses, text search, photos and history; it does not train or call an LLM.
- Day/month/year filters use inclusive/exclusive opened-at boundaries in the selected site's timezone
  (Europe/Kyiv when viewing all sites). All time is the default so old open incidents remain visible.
  Statistics use the same calendar range; the existing stats aggregation remains independent of the
  open/all queue toggle. All-time statistics cover records since Unix epoch.

## Implementation and reuse

Frontend slice: `features/incident-management` exposes the workspace; the knowledge page is a thin
page wrapper. Query owns server records and invalidation; Zustand owns drafts and filters.
Sign-out clears transient notes/photos. No forbidden React hooks were added. Reuse existing shadcn
fields, calendar, DataTable, photo viewer and hash navigation rather than introducing parallel table or
routing infrastructure. Legacy shared primitives and client-side table pagination remain boundary debt;
server pagination/search should be considered when measured incident volume requires it.

## Lean recommendation — Proceed

One photo and an optional caption give the master evidence without a separate typing step for the
worker. Two short fields capture the diagnosis and successful action once, next to the original photo.
Searchable previous solutions can reduce repeated diagnosis. Do not add AI, mandatory categorization
or worker paperwork in this change. Observe whether masters can locate a similar case and whether the
saved solution is useful; no shop-floor time-saving claim has been measured.

## Verification

Focused PostgreSQL tests cover required photos, note validation/rollback, draft save/clear, immutable
note snapshots, protected resolved notes and inclusive/exclusive dates. Synthetic Telegram updates
cover blocked skip/stop plus photos with/without captions. Component tests cover resolution validation,
knowledge display, calendar query wiring and existing photo/duplicate/SSE behavior. Pure calendar tests
cover DST and month/year boundaries. Affected type/lint checks and an independent transaction/migration
review are required; CI is the full integration gate. Production rollout evidence is reported separately.

Known existing system limitations: broad role/scope enforcement and durable Telegram admission are
separate tracked reliability work. This feature does not claim to resolve those boundaries.

## Completed records — owner clarification

Resolved, closed, rejected and duplicate incidents are read-only in the panel; only open incident
states show decision fields/actions. Remove bulk closing/reopening controls from this view. Terminal
shift details hide the action/message form and use the full detail width. Completed checklist reports
retain their existing read-only rule and show recorded master decisions as text. Filters, search,
photo viewing and history remain available. This is presentation behavior; audited backend correction
and lifecycle APIs retain their existing permissions and semantics.

## Calendar and detail readability

Both incident pages use CalendarPeriodField: an always-visible calendar trigger matching Schedule,
day/month/year tabs inside the same popover, and an all-time reset. All-time remains the default.
RowDetail provides a common bounded reading surface for every expanded table row and mobile card.
Incident cause, solution and legacy text use DetailText (readable line length, preserved line breaks,
long-word wrapping, keyboard-scrollable height limit). History metadata and prose occupy separate lines.
Operations, handovers, requests, employees and users reuse the same detail boundary; forms and photos
have bounded widths and narrow layouts stack vertically. Business permissions and mutations are unchanged.
Lean: proceed; consistent controls and grouping reduce searching and re-reading without extra worker input.
Visual acceptance requires actual desktop/mobile screenshots; no production records are created for QA.

## 2026-09-10 — Inclusive From/To period ranges

The owner refined the calendar requirement: day mode selects a date range; month mode renders only
12 months with year navigation; year mode renders only years with page navigation. All modes show
From/To and retain All time. A draft is applied explicitly after both endpoints are selected; canceling
or changing units does not fetch partial results. Selecting the same month/year twice selects one unit.

Shared UI now lives in `shared/ui/calendar-period-field.tsx`, with isolated Zustand draft state and
reused local-calendar conversion helpers in `shared/lib`. Existing shadcn primitives are retained;
DayPicker provides native range selection for days. Month/year grids reuse shadcn buttons because the
installed DayPicker does not provide those selection surfaces. Legacy shared primitives remain in
`components`; this is an incremental FSD move, not a wholesale UI migration.

Incident and knowledge workspaces persist both endpoints independently and apply the mode/endpoints
in one UI-store update. Existing single-date preferences fall back to that same date as the end.
Queries include the full final selected unit: start of the first unit through the exclusive start of
the unit after the last, in the selected site's timezone. All time sends no date constraints. Existing
list/statistics APIs and permissions are unchanged.

Verification: 15 focused model and incident regressions passed, including DST, leap February, reverse
selection, cross-year ranges, all-time and list/statistics query boundaries; panel typecheck and changed
code lint passed. Real-browser synthetic fixture verified 10–12 January, July–September, 2025–2028
across year pages, Apply and All time. Desktop light and mobile dark screenshots were captured and
inspected; month/year modes contained no day grid. Production publication is checked separately.

Source: [DayPicker range selection](https://daypicker.dev/docs/selection-modes/).
Lean: Proceed. The selection surface now matches the requested unit; applying once avoids unnecessary
requests while selecting endpoints. No production activity or worker messages were created for QA.

## 2026-09-10 — Details without repeated preview metadata

The incident detail view model suppresses the first report's matching author/opening time, redundant
photo captions and an empty initial REPORTED history entry already represented by the row. Additional
reports retain their identity/time. A legacy comment already present in a report/history is shown once.
Read-only current cause/solution remain available in full below truncated previews; matching history
values and missing-value placeholders are omitted. Unique older decisions and comments remain visible.
Photo accessible labels and lightbox labels are unchanged. No stored reports/history are modified.

Handover details omit the repeated photo count, empty photo section and a single decision label that
already matches the preview. Multiple historical decisions retain their labels. Request/shift details
already contain additional evidence/actions rather than repeated static identity fields. Editable
forms remain complete; deduplication does not remove fields needed to make a decision.

Verification: 18 focused incident/model/handover tests passed; panel typecheck and changed-code lint
passed. Actual shared components were captured and inspected at 390px and 1440px with synthetic data:
no repeated photo caption, no horizontal page overflow, full decision text remains readable.
Lean: Proceed. Reduce repeated reading while preserving evidence and complete prose; no extra worker
input. Production verification is recorded separately after CI publication.

## 2026-09-10 — Freeze SLA at the first recorded response

The incident column previously passed only slaDueAt and slaBreached to the generic live Deadline.
Deadline also marks any past date overdue, so even a timely resolved incident kept accumulating a
false delay. Live evidence: the 13:35 report resolved at 14:04 showed more than six hours overdue
although its normal one-hour SLA was met.

The pure incident SLA model now uses acknowledgedAt, falling back to resolvedAt. Only unanswered
open incidents render the shared live Deadline. Responded records show an immutable on-time response
duration or delay relative to the original deadline, alongside the absolute deadline. Repair completion
and reopening do not replace a recorded first response. Safety shows immediate response and, when
available, the recorded response duration instead of a continuously overdue zero-minute countdown.
Rejected/duplicate records without response show not applicable; legacy completed records without
response timestamps show unknown. Red row backgrounds identify only outstanding response work.
The existing backend policy, historical breach statistics, notifications and stored timestamps remain
unchanged. Safety's zero-minute policy still contributes to backend statistics; this UI change does
not silently redefine those metrics or claim that recorded response equals physical arrival.

Reuse: existing Deadline, StatusPill, date/duration formatters and table/card layouts; no dependency or
new clock. StatusPill accepts an optional className so SLA text can wrap within the mobile card.
Verification: nine focused model regressions, panel typecheck and affected lint passed. Real-component
screenshots inspected at 390x844 and 1440x1000 cover on-time, late, pending, safety and rejected states;
a 24-hour delay wraps on mobile and document width remains 390px. Production verification follows CI.
Lean recommendation: proceed; separate unanswered work from historical outcomes to remove false
urgency. Masters should record taking ownership when responding, then enter diagnosis after repair.
