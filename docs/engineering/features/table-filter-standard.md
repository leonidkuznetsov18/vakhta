# Feature: shared tables, filters and keyboard interaction

## Outcome and scope

Implement the [site-wide standard](../table-filter-standard.md) for the
[admin panel](../../features/11-admin-panel.md), preserving existing business statuses, permissions,
exports and evidence. Masters can use the same inspection, sorting, selection and pagination controls
on desktop and mobile. Kiosk and worker Telegram behavior are outside this presentation change.

## Current behavior and ownership

`components/app/data-table.tsx` is the shared renderer for 24 production call sites as of 2026-09-12
(the original 2026-09-10 migration covered 23).
`shared/lib/table-model.ts` uses TanStack Table 9.2.4 for filtering/sorting and pagination around the
existing active-record page resolution. Query remains the remote source of truth; Zustand holds scoped
UI preferences. Feature columns/actions supply business meaning. Schedule keeps its editable matrix;
Audit field differences keep compact native tables. Both reuse shared counts and semantics.

## Decisions and reuse

Reuse existing shadcn primitives, native controls, mobile cards, RowDetail, QueryFeedback and calendars.
Status filters use the existing segmented presentation with single-choice semantics rather than tabs
that promise a nonexistent panel. Audit and terminal details move inline; directory editing stays an
explicit action where no hidden record information needs expansion. Native buttons replace pagination
anchors and fake keyboard-clickable table rows. One shared form accessibility context associates errors;
required searchable selects retain native validity, keyboard operation and visible focus.

Filter/sort and pagination are two controlled TanStack stages so active-record deep links retain their
existing page behavior. Raw values determine sorting. No new lifecycle/memo hooks, server mutations,
permission rules or duplicate query cache were introduced. The official installed v9 API was inspected;
v8-style tutorials are not copied into this implementation.

## Lean review

Recommendation: **Proceed with simplification**. The audit found inconsistent inspection surfaces,
missing mobile sort/selection/totals and unreadably compressed columns. Reusing controls removes
relearning and extra navigation without adding worker input. Browser evidence confirms accessible
inspection and preserved evidence; reduced task time remains a hypothesis to validate with masters.
Guardrails: no hidden bulk-action targets, no lost history, no changed operational decisions. Roll back
if normal inspection, registration or authorized actions regress.

## Verification

2026-09-10, local source migration on master, preview with fictitious data and no production writes:

- Focused Vitest coverage: shared table count/paging/filter/sort, independent namespaces, selection,
  keyboard disclosure and mobile summaries; required selects, keyboard search, field errors, guarded
  submission and initial dialog focus. Affected Operations, Handover, Incidents, Requests, Admin,
  Reports, Audit, Bonus and Overview suites passed across the focused runs.
- TypeScript typecheck, affected-file ESLint, formatting and the production panel build passed.
- The first CI attempt exposed recursive NWSAPI 2.2.27 `Element.matches` fallback for unsupported
  native `:modal`/`:fullscreen` states in jsdom. A CPU profile isolated that recursion. The test setup
  now models only the absent native top-layer states as false; real Radix/cmdk and focus behavior remain.
  All seven field tests dropped from about 18 seconds locally to 174 ms without extended timeouts.
- The terminal registration regression test caught a newly created terminal being absent until the
  organization snapshot refreshed. The canonical registration response now provides its temporary
  inline row and pairing code; the regression test passes.
- Browser keyboard checks: Enter/Space expansion, checkbox mixed state, Tab navigation, Escape detail
  closure/restored focus, searchable-select ArrowDown, typed lookup, Enter selection and nested Escape.
- Captured and inspected screenshots in the task: desktop 1440 x 900 and mobile 390 x 844 for employee
  cards, incidents, audit and terminals; desktop summaries and form popup. No document-level horizontal
  overflow in inspected views; the incident zone column now retains 208 px instead of the audit's 49 px.
- Native browser emulation was used, not physical iPhone hardware. No VoiceOver/NVDA certification,
  exhaustive WCAG audit or production mutation campaign is claimed. Existing CI is the broad gate.

## No-op filter actions — 2026-09-11

Owner requirement: disable actions when they would make no change. The annotated-photo library
previously always enabled Reset, and enabled Search for unchanged valid inputs. Its existing page
model now derives `canReset` from draft and applied filters, and `canApply` from normalized query
values compared with applied filters. Both handlers are guarded. Pagination alone enables neither
action; invalid inputs remain clearable; explicit query retry is unchanged. Existing shared buttons
provide native disabled styling and tooltip access; no new components or dependencies are needed.

Lean recommendation: **Proceed**. Remove misleading clicks without adding worker steps. Acceptance:
empty defaults disable both buttons; changing any filter enables useful actions; restoring defaults
disables Reset; clearing a draft while a filter remains applied still enables Reset. Whitespace-only
search differences do not enable Search. Rules are recorded in AGENTS.md and engineering standards.

Verification: nine focused library model/component tests, panel TypeScript, affected-file ESLint and
Prettier passed. Browser and deployment verification is reported with the delivery.

## Stable expanded-row geometry — 2026-09-14

Status: accepted owner request. Baseline: `5c0ac04`. Writer/integration owner: Codex.

### Recon and specification

The current inventory has 31 production DataTable declarations, including 11 `expanded` callbacks:
Operations, Handover, Incidents/knowledge, Requests/overtime, Reports intervals, Audit/events,
Checklists, Users and Terminals. Other declarations are Bonus (3), directories (5), Employees,
Import, photo library, incident statistics, report summary and Schedule sheets (7). Native exceptions
are Audit field/payload tables and the two Schedule matrices; neither matrix expands table rows.
All record expansions already share RowDetail. In the 1440 px local Handover preview, opening five
fixed-dimension photos changed the zone column from 203 to 185.578 px while the table stayed 1134 px.
The colspan detail's intrinsic width participates in automatic table layout.

Acceptance: opening, closing or loading details preserves parent column widths and horizontal
positions (within 1 CSS px at a fixed viewport). This includes long text, photos and nested tables.
Details retain natural height, complete evidence, keyboard access and mobile card width; page-level
horizontal overflow must not appear. Actual dataset/viewport changes may still resize columns.
No animation that masks a width change, fixed row heights, column-width snapshots, business changes,
new dependencies or table architecture migration are in scope.

### Design and verification plan

Apply inline-size containment to the existing RowDetail block, never to a table/cell. Keep automatic
column sizing from summary rows and natural detail height. Reserve the root scrollbar gutter so a
newly taller page does not reduce the available inline width on systems with classic scrollbars.
Existing shared legacy ownership is retained; no new frontend slice, lifecycle hook or state is needed.
This follows [CSS inline-size containment](https://www.w3.org/TR/css-contain-3/#containment-inline-size)
and [scrollbar gutters](https://www.w3.org/TR/css-overflow-3/#scrollbar-gutter-property).

Run the existing DataTable regression suite and affected TypeScript/lint/format checks. Browser
regression measurements cover all available expansion variants, repeated toggles, photo completion,
nested evidence tables, narrow desktop and mobile; capture and inspect desktop/mobile screenshots.
Record unavailable fixture/live coverage explicitly. CI remains the broad integration gate.

Lean recommendation: **Proceed**. Keep the master's visual reference point while inspecting a record,
removing reorientation without adding any actions. Measure column coordinates before/after disclosure;
preserve evidence, drafts, permissions and focus. Verification results follow below.

### Results

- Chrome, local preview, fictitious administrator data: all 11 expansion declarations measured
  **0 px** change in parent column widths/positions at 1440 × 900 and **0 px** card width/position
  change at 390 × 844. Page scroll width matched the viewport in every case. Handover also passed
  at 1024 × 900 with the existing table-local horizontal scrolling. Loaded photos and long event
  payloads remained readable; desktop/mobile screenshots were captured and visually inspected.
- The formerly empty event preview now includes long text/unbroken references in the actual nested
  payload table. The report fixture needed current completeness metadata and a valid interval UUID
  before its existing runtime validation would allow the interval expansion to be exercised.
- Existing DataTable suite: **20 tests passed**, including keyboard disclosure, focus, mobile details,
  query states, paging and retention during refresh. Panel typecheck, affected-file ESLint, Prettier
  and diff whitespace checks passed. Real-browser measurements are the CSS regression check;
  jsdom does not prove geometry. No new browser runner/dependency was added.
- Local evidence: `test-results/table-layout/measurements.json` and the adjacent desktop/mobile PNGs.
  Reproduce with `preview.html?lang=uk`: measure header cell widths/x positions, toggle the detail,
  remeasure, then repeat in mobile cards. The Audit events fixture specifically covers nested tables.
- Limits: this is fixture-based browser coverage, not production employee activity. Physical devices,
  Safari/Firefox and classic-scrollbar systems were not exercised. The root gutter follows the CSS
  standard; Chrome here uses overlay scrollbars. CI/release/production verification is reported with
  delivery. Lean outcome: no extra worker steps; the demonstrated horizontal reorientation is removed.

## Remaining work

### Admin UX audit — 2026-09-12

The [dated admin UI/UX audit](../../audits/2026-09-12/admin-ui-ux-audit.md) records current source
coverage, desktop/mobile fixture observations, 24 prioritized findings and proposed page-composition
acceptance criteria. This is an audit, not a claim that the findings are fixed. It preserves this
standard as the canonical contract; Schedule, photo review and compact audit evidence retain their
task-based exceptions.

Lean recommendation: **Simplify**. First protect record identity and unsaved work, then make query
states/actions trustworthy, repair measured form geometry, and standardize page composition. No
worker input or Telegram steps are added. Production role sessions, physical-phone/photo workflows
and comprehensive assistive-technology checks remain unverified; fixture endpoint gaps are explicit
in the audit. Product code is unchanged by this documentation delivery.

Audit/request capped endpoints still need server count/search/pagination for complete archive browsing;
the UI explicitly discloses their limits. Validate representative tasks with masters on physical phones
and assistive technology. Do not introduce additional controls or change domain semantics to address
those follow-ups. Release/deployment outcome is reported with the delivery.
