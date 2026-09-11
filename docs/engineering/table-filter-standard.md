# Site-wide table and filter standard

Date: 2026-09-10. Audit baseline: `fa0ca97`, panel v0.73.8.
Status: migration implemented in the shared renderer and production table configurations; release verification is recorded in the [feature memory](features/table-filter-standard.md).

## Outcome and boundaries

Masters and administrators must be able to find a record, understand its state, inspect evidence and
take the permitted next action without learning a different table on each page. The owner requests
one consistent approach using existing elements, terminology and business semantics.

Reuse DataTable, mobile cards, Toolbar, existing calendar fields, Tabs, SelectField, Input, RowDetail,
TextPreview, ScrollableText, TableCount/Paginator, QueryFeedback and LoadingState. Do not introduce
saved views, filter builders, column-management panels, infinite scrolling or a second design system.
Consistency governs interaction and presentation; it does not make unrelated business fields identical.

This standard complements [engineering standards](standards.md) and the UI requirements in
[AGENTS.md](../../AGENTS.md). Existing feature documents remain authoritative for business rules.

## Audit baseline: inventory and patterns

The source inventory contains 23 production DataTable call sites. Some render multiple views: the
incident workspace serves two pages, and StatsTable serves reason and zone summaries. Schedule uses
a separate editable matrix; Audit has two additional compact detail-table declarations.

Paths below are relative to `apps/admin-web/src/`.

| Surface / source                                         | Existing tables                                   | Existing filters / navigation                                                        | Migration focus                                                      |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Overview                                                 | No record table; queue cards navigate to lists    | Role-scoped queue presets                                                            | Preserve matching destination filter/count semantics                 |
| `operations/OperationsPage.tsx`                          | Shift list                                        | Site, unit, scope, day, state tabs                                                   | Search/sort consistency, mobile identity, actionable state           |
| `handover/HandoverPage.tsx`                              | Handover reports                                  | Site, pending/overdue/all, date                                                      | Search/sort consistency, decision state, deadline                    |
| `features/incident-management/ui/incident-workspace.tsx` | Incidents; knowledge list                         | Site, open/all for incidents, period range, text search                              | Column widths, filter order, readable details                        |
| `features/incident-management/ui/stats-table.tsx`        | By reason; by zone                                | Inherited incident period/scope                                                      | Mobile aggregate footer, separate preference namespaces              |
| `requests/RequestsPage.tsx`                              | Requests; overtime                                | Inbox/all scope tabs; no text search                                                 | Consistent search/sort, explicit dataset scope, overtime namespace   |
| `schedule/ScheduleGrid.tsx`                              | Employee × day matrix                             | Site, unit, single month, schedule version                                           | Retain matrix editing; normalize paginator options                   |
| `reports/ReportsPage.tsx`                                | Category/reason summary; intervals                | From/to, site, unit; category drill-down; interval search                            | Filter order, truncation/count scope, text previews                  |
| `bonus/BonusPage.tsx`                                    | Monthly employee points; history buckets; entries | Site/unit, points/history; single month or from/to, grouping, basis, employee search | Distinguish grouping from date selection; avoid conflicting searches |
| `admin/EmployeesTab.tsx`                                 | Employees                                         | Status, Telegram binding, text search                                                | Human-readable card identity, touch selection                        |
| `admin/UsersTab.tsx`                                     | Users and roles                                   | Text search                                                                          | Shared selection, sorting and detail conventions                     |
| `admin/DirectoriesTab.tsx`                               | Sites, units, teams, positions, zones             | Per-table search; applicable parent scope                                            | Row inspection versus editing, consistent toolbar structure          |
| `admin/TerminalsTab.tsx`                                 | Terminals                                         | Existing organization context                                                        | Readable status, common search/sort where meaningful                 |
| `admin/ChecklistsTab.tsx`                                | Checklist definitions                             | Text search                                                                          | Preserve inline preview and existing explicit actions                |
| `admin/ImportDialog.tsx`                                 | CSV preview                                       | Local file/validation workflow                                                       | Local count semantics; preserve import validation                    |
| `audit/AuditPage.tsx`                                    | Audit log; domain events; detail fields           | Audit/events tabs, action/object or event-type filters, text search                  | Capped history, inline details, accessible technical values          |

Kiosk and worker Telegram are not alternative admin table implementations and are outside this
presentation migration. They must not acquire panel-style filters as incidental cleanup.

## Audit baseline: confirmed findings

| Priority | Evidence                                                                                                                                                         | Consequence / correction                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | DataTable renders `footer` only in its desktop branch; StatsTable supplies aggregate rows through it                                                             | Mobile loses existing totals. Render equivalent totals in both layouts, with their original aggregation scope                                                                |
| P1       | Audit requests `limit: 200`; DataTable only knows the returned array                                                                                             | A loaded count is not proof of the complete archive size. Use known server total or explicitly disclose the loaded subset, following the existing Reports truncation pattern |
| P1       | Sorting and select-all exist in the desktop header, absent from mobile cards                                                                                     | Preserve these existing capabilities on mobile using the existing button/select/checkbox primitives                                                                          |
| P1       | Sort button accessible names contain direction but omit the column; row checkboxes are named with internal IDs; expandable rows lack an announced expanded state | Supply meaningful names and keyboard-operable disclosure semantics                                                                                                           |
| P2       | At 1440 px, the live incident zone column measured approximately 49 px and broke ordinary names into fragments                                                   | Declare widths/minimums by content role; do not squeeze all columns into unreadability                                                                                       |
| P2       | At 390 px, employee card headers lead with personnel number; sampled cards were 238–286 px tall                                                                  | Prioritize the existing human-readable identity; move secondary detail to the existing expansion surface without losing information                                          |
| P2       | Audit still uses DetailSheet for record inspection; directory row clicks directly open editing                                                                   | Apply the existing inline inspection rule and keep editing an explicit action                                                                                                |
| P2       | Several working queues omit `searchText`/`sortValue`, while reference tables expose them                                                                         | Reuse the existing search and sorting capabilities where the same kind of field can be searched or compared                                                                  |
| P2       | Tables without `storageKey` share `__local.search`, `__local.sort` and page-size fallback keys                                                                   | Give every independent dataset a stable preference namespace; never share preferences accidentally                                                                           |
| P2       | Schedule starts at 25 rows but shared page-size options are 10/20/50/100                                                                                         | Use the shared existing default/options; the selected value must always be a listed option                                                                                   |
| P2       | Filters have different ordering and search placement across pages                                                                                                | Apply one toolbar ordering and one scope per search                                                                                                                          |
| P2       | Raw string cells receive generic wrapping; JSX cell content bypasses that protection                                                                             | Apply the same bounded preview rules to all content types                                                                                                                    |

The dependency reset pattern is already present in Operations and Reports: changing site clears unit.
Preserve and propagate it; this audit does not report it as a defect on those pages.

## Universal rules

### Dataset, totals and state

- **D1 — One scope:** filters, sort, pagination, counts and exports must refer to the same authorized
  dataset. RBAC applies on the server. Existing export scope must remain explicit; do not silently
  change an export from full filtered results to the visible page.
- **D2 — Honest totals:** always show TableCount below a successful table, including zero/small results.
  With 186 matching records and a 10-row page, the total is 186. Count after filtering, before paging.
  With a capped response and no full count, disclose truncation; never label the cap as the archive total.
  Aggregate bucket rows count buckets, not the underlying incidents or employees.
- **D3 — Consistent query pipeline:** filter, then sort, then paginate. Server-paginated datasets perform
  these operations on the server; client search over one loaded page is not global search. Keep a
  deterministic tie-breaker and sort using raw numbers/instants, not localized strings.
- **D4 — Real async feedback:** initial load, background refresh, paused/offline, error, successful empty,
  no matches and saving remain distinguishable. Reuse QueryFeedback and one LoadingState per pending
  surface. Keep cached rows on refresh, drafts on failure and explicit retry. Never invent zero on error.
- **D5 — Pagination:** use the shared options/default and Paginator; reset to the first page when dataset
  filters/search change and clamp after deletions. Keep a stable record ID for expansion/selection.
  Pagination does not alter domain totals or remove aggregate information on mobile.

### Filters and terminology

- **F1 — Fixed order:** organizational scope (site, then dependent unit), time, business state/type,
  text search. Render only applicable existing filters. Creation/export/bulk actions are actions,
  not filters. Keep existing control labels and use one responsive Toolbar arrangement.
- **F2 — Dependent values:** changing a parent clears an invalid child and updates query parameters
  together. Never issue a query with a unit from another site. Preserve valid, deliberate defaults.
- **F3 — One search meaning:** each search names its actual searchable fields and affects one declared
  dataset. Do not place two indistinguishable searches over the same rows. Preserve dedicated employee
  search versus entry-text search when their scopes differ, and make that distinction clear.
- **F4 — Stable state ownership:** namespace preferences by dataset, including sibling tables on one
  page. Do not persist query results in client UI state. Restore only valid values; navigation from
  Overview must apply its intended queue preset without a stale hidden filter overriding it.
- **F5 — Calendar consistency:** reuse the existing calendar trigger/popover. Range mode shows day
  endpoints for days, month endpoints for months, year endpoints for years; retain the existing
  all-time action where supported. Single business day and single accounting month remain explicit
  modes of the same calendar family, not new dropdown designs.
- **F6 — Time semantics:** preserve site timezone, inclusive user-selected end dates, server boundary
  conversion and night-shift business dates. Reject/recover an inverted range before fetching.
  Bonus history grouping changes aggregation, not the selected date boundaries.
- **F7 — Preserve meaning:** submitted status, pending master decision, overdue and all are different
  concepts. Do not rename or merge them to make controls look identical. Likewise, resolved/closed
  and missing/unselected/all must not be conflated. Retain localized terminology in all three catalogs.
- **F8 — Clear behavior:** reuse existing clear/reset controls. Clearing a date removes that filter,
  not organization scope. A page tab selects a workflow; a status tab filters records. Neither implies
  a server mutation. Expose the effective filter value; do not rely on a tooltip alone.
- **F9 — Action availability:** disable reset when both draft and applied filters are at their
  defaults, including on later pages. Enable it for unapplied edits or still-applied filters even
  when the visible draft has been cleared. Disable apply/search when normalized filters equal
  the applied values or validation fails; guard submission as well as the button. Pagination alone
  is not a filter edit. Keep explicit request retry/refresh available for recovery.

### Rows, details and responsive presentation

- **T1 — Shared composition:** all record lists use the shared DataTable family; no page-local copies
  of pagination, loading, selection or expansion logic. Keep feature-specific columns and prepared
  models outside the shared renderer. Existing matrix/detail-table exceptions are listed below.
- **T2 — Information hierarchy:** identify the record first, then show the existing status/context
  needed to decide what to do. Put supporting evidence/history in RowDetail. Choose identity from
  existing fields; do not fabricate names or hide meaningful distinctions between records.
- **T3 — Width and alignment:** text starts at the leading edge, numeric comparisons align at the
  trailing edge, units remain visible, status stays with its label. Assign bounded space by content
  role. Use existing table scrolling when necessary instead of crushing names into tiny columns.
- **T4 — Text:** previews use TextPreview or bounded wrapping; full content uses ScrollableText or
  DetailText with preserved line breaks, bounded width/height and vertical scrolling. Never truncate
  the only accessible version. Technical identifiers also wrap without stretching the page.
- **T5 — Inline inspection:** opening a record shows RowDetail beneath the row/card. Preserve row
  context and scroll position. Do not duplicate preview fields, identical captions or legacy comments;
  retain distinct historical evidence and full text omitted by a preview. No DetailSheet for row data.
- **T6 — Actions:** explicit existing actions initiate editing; a generic row tap must not unexpectedly
  open a mutation form. Keep controls near their fields and prevent checkbox/menu taps from expanding
  the row. Completed/resolved records show read-only information and no disabled editing form.
- **T7 — Mobile parity:** reuse cards with a clear existing identity/status and readable supporting
  fields. Reordering/presenting fewer preview fields must preserve access to the full record. Sorting,
  selection, aggregate totals, counts and permitted actions must remain available. Do not force users
  to switch to desktop for a capability that the same list already offers.
- **T8 — Sorting:** use the existing sort cycle and indicators for comparable fields. Exclude action,
  photo and arbitrary rich-content columns. On mobile, expose the same supported sort keys/direction
  through existing controls; do not introduce different ordering semantics.
- **T9 — Selection:** retain visible-page select-all scope, label it accurately and show mixed state.
  Individual labels identify the human-readable record. Do not silently add all-filtered bulk actions.
  When filters change, remove selections outside the active result scope to avoid hidden-target actions.
- **T10 — Accessibility:** preserve native table headers on desktop and semantic lists/labels on mobile.
  Give each table an accessible name; include column name and direction in sort controls. Disclosure
  must support Enter/Space and announce `aria-expanded`; keep focus predictable after closing details.
  Use existing touch-control sizing, aiming for 44 px hit areas without changing checkbox glyph size.
  Do not implement an ARIA grid unless its full keyboard interaction is actually needed and implemented.

## Justified alternatives, applicable by task rather than page

| Existing task                               | Alternative retained                              | Why / invariants                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing an employee-by-day schedule         | Editable horizontal matrix; single month/version  | Card conversion would remove cross-day comparison and change scheduling. Shared counts, loading, focus, touch access and typography still apply |
| Choosing a monthly nomination period        | Single month                                      | A monthly award has one accounting period. A range would change the entity being displayed                                                      |
| Selecting the operational business date     | Single day                                        | A day filter is not an arbitrary history range; preserve current queue semantics                                                                |
| Reading aggregated reports                  | Existing category drill-down and grouping         | A category is a query dimension rather than a record to edit. Preserve navigation/back context; use inline detail for actual underlying records |
| Validating a local import                   | Preview inside the existing import dialog         | These are not yet persisted employees. Count parsed/filtered preview rows and keep validation errors visible                                    |
| Reading field differences in audit evidence | Compact labeled field table inside inline details | Before/after comparison has no independent dataset filtering need; preserve exact values and bounded text                                       |

No other page-specific behavior is justified merely because it was implemented earlier. A future
exception must name a distinct task, its invariant and the shared rules that still apply.

## React / TypeScript implementation boundary

The shared renderer now uses `@tanstack/react-table` 9.2.4 through
`shared/lib/table-model.ts`. A controlled filter/sort stage prepares rows, existing deep-link logic
resolves the active page, and a controlled pagination stage selects visible rows. Both stages use
TanStack row models; neither duplicates remote data or stores another copy of search preferences.

Query owns remote state; dataset-scoped Zustand preferences own search, sort and page size. The
renderer retains stable IDs and typed column selectors. Feature models retain permissions, deadlines
and business actions. No application-owned forbidden React hooks were introduced. Virtualization
requires a measured need and is not part of this migration; routing semantics remain unchanged.

### Shared keyboard contract

- Tab/Shift+Tab follow native focus order. Desktop tables remain tables, not incomplete ARIA grids.
- Enter/Space activate native row-disclosure, selection and pagination buttons. Disclosure announces
  its expanded state and controlled region. Escape within inline details closes them and restores
  the disclosure button, unless a nested popup has already handled the event.
- Native selects retain browser keyboard behavior. Searchable selects open with ArrowUp/ArrowDown,
  accept typed search and Arrow/Enter selection, and close with Escape without closing the parent form.
- Dialogs focus the first usable field, retain Radix focus containment/restoration, and localize close
  controls. Inline row details deliberately do not trap focus.
- Form errors are linked to controls with `aria-describedby` and `aria-invalid`. Required searchable
  selects participate in native validation and move focus to their visible trigger when invalid.
- Enter retains native form behavior; plain Enter in a textarea inserts a newline. Ctrl/Cmd+Enter
  in shared inputs/textareas submits through the enabled explicit submit button and browser validation.
  Composition, disabled submission and handled keyboard events do not bypass guards.
- Selection announces visible-page scope and mixed state. Filter/search changes clear employee
  selection. If refreshed data leaves hidden selected IDs, bulk actions are withheld until selection
  is explicitly cleared; this avoids applying an action to invisible records.

## Migration plan and acceptance

| Step                          | Work                                                                                                                                                                                    | Acceptance evidence                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Shared correctness         | Separate complete totals from capped results; retain aggregate footer on mobile; fix accessible sort/selection/disclosure names and states; namespace preferences; normalize page sizes | Focused tests for 186 records with a 10-row page, zero/error/capped data, mobile totals, selection scope and independent sibling-table state                    |
| 2. Common controls and layout | Shared toolbar order, column width/text policy, mobile identity and access to current sort/selection; preserve dependent-filter clearing                                                | Desktop 1440 px and mobile 390 px screenshots; inspect narrow intermediate width where columns previously collapsed; keyboard/touch checks on affected controls |
| 3. Working queues             | Apply to Operations, Handover, Incidents/Knowledge and Requests/Overtime; align existing search/sort capabilities                                                                       | A master can find/open a pending item; count and destination list agree; completed items remain read-only; dates and permissions unchanged                      |
| 4. Administration and audit   | Apply to employees/users/directories/terminals/checklists/import; replace audit sheets with inline details and disclose archive limits                                                  | Read versus edit behavior is explicit; no evidence lost; accessible mobile selection; preview counts distinguished from persisted totals                        |
| 5. Analytics and schedule     | Apply shared rules to statistics/reports/bonus; retain documented matrix/grouping exceptions                                                                                            | Aggregates remain identical, exports keep intended scope, grouping does not change selected date bounds, month semantics unchanged                              |
| 6. Internal consolidation     | Replace custom row-processing engine with compatible TanStack behavior behind the same shared contract                                                                                  | Existing behavior tests pass, no forbidden hooks, no duplicated state, no user-facing concept changes                                                           |

Keep each step a coherent task-owned delivery. Do not push intermediate documentation separately from
the implementation it accompanies. Follow the existing direct-master/semantic-release flow for actual
deliveries. Preserve current business defaults, API permissions and terminology throughout migration.
Do not rewrite historical records, SLA calculations, bonus results or worker messages as UI cleanup.

Tests are focused on changed behavior; existing CI supplies the broad integration gate. Inspect changed
desktop/mobile screenshots once per coherent UI change. Test one representative shared component
thoroughly plus each migrated page's meaningful configuration; do not duplicate identical tests for
every table or rerun unrelated kiosk/Telegram journeys for a presentation change.

## Audit evidence and limits

Reviewed shared rendering/filter primitives and all listed table call sites at `fa0ca97`. Inspected
authenticated production views as the QA administrator on v0.73.8, including Operations, Handover,
Incidents/Knowledge, Requests, Schedule, Reports, Bonus points/history, Audit and administration tabs.
Desktop/mobile screenshots and DOM measurements informed layout findings. Mobile observations used
browser viewport emulation, not physical iPhone hardware. Sampled live card data is not a performance
benchmark or a general WCAG certification.

Empty queues, import preview, some report drill-down/detail variants and failure branches were assessed
from source rather than exhaustively exercised with production mutations or injected outages. The live
Schedule selection was empty; populated matrix editing was not exercised. No production employee
records were intentionally changed, and no runtime test suite was run for this documentation-only audit.

## Lean review

Recommendation: **Simplify**. Inconsistent controls, missing mobile capabilities and excessive preview
detail increase searching, scrolling and repeated navigation. First repair the common surface, then
migrate the working queues; do not add controls without a demonstrated existing task.

Validate with representative masters: locate an outstanding report, inspect its evidence and identify
the available next action on desktop and phone. Compare navigation retries, mis-taps and completion
time before/after; do not claim a numerical improvement before observation. Add no worker data-entry
step. Guardrails: no hidden pending items, no lost evidence, no changed decisions or access scope.

## Sources consulted

- [shadcn Data Table](https://ui.shadcn.com/docs/components/base/data-table): reusable primitives and
  composition support shared interactions while retaining dataset-specific columns. Current examples
  use a different engine API than this repository; verify compatibility before adoption.
- [WAI table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/): retain native table semantics.
- [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/): keyboard activation
  and announced expansion state.
- [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
  target size has spacing exceptions; a measured small glyph alone does not prove nonconformance.

## Implementation disposition

All six migration steps are implemented across the inventoried shared table call sites. Working queues
share search/sort where meaningful, the filter order is normalized, analytics keep mobile totals, and
Audit/Terminals inspect records inline. Read-only directories whose fields are already fully visible
have no redundant expansion; editing remains an explicit existing action. Schedule retains its matrix.

Known server totals are shown independently of loaded-page length. Audit (200) and request history
(500) still use existing capped endpoints without a complete server count. They disclose loaded-subset
semantics; server-wide search/pagination requires a separate API change. Reports/Bonus retain their
existing export and aggregation scope. Empty incident statistics retain one shared period-empty state
instead of two identical empty tables.

Verification and remaining device/assistive-technology coverage are recorded in the
[feature memory](features/table-filter-standard.md). The audit observations above describe the previous
baseline, not outstanding defects after this implementation.
