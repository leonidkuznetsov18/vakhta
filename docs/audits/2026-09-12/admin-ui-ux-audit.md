# Admin UI/UX audit and page-pattern proposal

Date: 2026-09-12. Baseline: `ae3c8f3b540232927403c3e20076233463fc4a66`, current `master`.
Status: baseline audit and proposed acceptance criteria. The follow-up implementation below is separate
from the baseline findings; this is not a claim that all findings are resolved.

## Decision

Vakhta already has a useful design system: shadcn/Tailwind tokens, one DataTable with mobile cards,
RowDetail, calendars, state filters and query feedback. Keep that foundation. The priority is reliable
record identity, draft retention, truthful data states and consistent page composition. A visual rewrite
would leave the most consequential problems intact.

The consolidated backlog contains 24 items: four P1 correctness defects, eighteen P2 usability,
accessibility or pattern gaps, and two P3 improvement/documentation items. P1 means credible wrong-target
behavior or loss of consequential input; P2 means material task friction or unreliable understanding;
P3 means improvement without a demonstrated blocked task. These priorities are reviewer judgments,
not CVSS scores or a WCAG certification. No P0 is claimed.

## Scope, specification and evidence

The requested outcome is a review of every admin page family, a concrete problem backlog, and rules for
building subsequent pages without inventing patterns again. Existing permissions, attendance rules,
exports and recorded evidence remain the authority. This audit does not authorize new business
features, a second component library, changes to production records, or a frontend rewrite.

Two independent source assessments covered design/workflows and implementation/accessibility. The
design assessment was completed before the integration owner read the technical assessment. Impeccable
provided the critique/audit workflow; Vercel Web Interface Guidelines provided an implementation checklist.
The Impeccable detector exited successfully with `[]`; all actionable findings came from manual source
inspection and browser verification. An empty detector result is not a clean bill of health.

Browser checks used the existing local Vite fixture preview, `http://localhost:5173/preview.html`, with
its fake ADMIN account. Screenshots were captured and visually inspected in the task at 1440×900 and
390×844; the long-dialog check used 1440×700. A Requests dark-theme spot check was also inspected.
Screenshots remain in the task trace; this document records the reproducible observations, rather than
claiming an independently archived screenshot bundle. Temporary viewport overrides were reset.

An existing production session displayed v0.93.2, but its profile was not the dedicated QA identity.
Inspection stopped after checking identity. This is not authenticated production QA coverage. No
production decisions, role changes, employee messages, pairing operations or saves were performed.
Local form drafts were exercised without submitting; extra checklist items created for geometry
testing were removed afterward. Existing services were not stopped or replaced.

Evidence labels below:

- **Runtime:** reproduced against current local source with fixtures; not proof of production API behavior.
- **Source:** deterministic code/data-flow or semantic evidence; the cited runtime condition was not exercised.
- **Proposal:** an experience improvement or consistency gap, with its rationale and acceptance criteria.

### Coverage matrix

All 11 main sections were opened and visually inspected at desktop and phone widths. Source coverage
includes their nested forms and states; runtime coverage is explicitly narrower where fixtures lack data.

| Family / variants            | Source coverage                                                               | Browser coverage and remaining limitation                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                     | Attention/quiet cards, presets, scope, incomplete loads                       | Desktop and mobile cards; task time and all role variations not measured                                                                |
| Operations                   | Filters/states, open/final shifts, start/transition forms, intervals/events   | Desktop table and inline detail; mobile filters/cards/detail; no shift transition                                                       |
| Schedule                     | Draft/review/published/superseded, assignments, rotation, employee/zone cells | Desktop/mobile empty month; populated matrix and historical inactive employee case source-only                                          |
| Incidents                    | Open/all, dates, detail/evidence, resolved state, reason/zone statistics      | Desktop list/statistics and mobile list; no resolve/merge mutation                                                                      |
| Handover                     | Answers/notes/photos/history, pending/final states, decision form             | Desktop/mobile list, keyboard detail, native accessibility tree; no operational decision                                                |
| Photo library                | Apply/reset, server pages, total, filters, selected inspection                | Desktop/mobile error and filters; mock lacks `/admin/photo-inspections`, so populated list/editor not runtime-verified                  |
| Photo inspection overlay     | Human review, annotations, AI limits, conflict, read-only, dirty close        | Source-only; image, touch, physical pinch and complete review journey remain unverified                                                 |
| Requests + overtime          | Inbox/history/types, correction, minutes, decisions, medical evidence         | Desktop two datasets and request detail; mobile request cards; draft-loss navigation reproduced; no submitted decision                  |
| Bonus / points and history   | Winners, units, charts, totals, entries, export and search scope              | Both tabs desktop/mobile, mobile chart spot check; multi-site, failed-query and export scenarios source-only                            |
| Reports                      | Scope/date, completeness, categories/reasons/intervals/export                 | Desktop/mobile unavailable-result state with misleading zeros; populated drill-down not verified because fixture contract is incomplete |
| Administration / employees   | Filters, page selection, edit, import, status, position/checklist, activation | Desktop table/mobile cards; import and activation overlays source-only                                                                  |
| Administration / users       | Rename, roles/scopes, grant/replace/revoke/create                             | Desktop/mobile list and inline form; wrong-user draft reproduced without save; no access change                                         |
| Administration / directories | Sites, units, teams, positions, zones; create/edit                            | All five datasets in desktop full-page screenshot; first mobile directory card and shared layout; edit variants source-only             |
| Administration / terminals   | Register, pairing, statuses, connection detail                                | Desktop/mobile list; duplicate-name pairing condition verified in source/schema only                                                    |
| Administration / checklists  | Items, assignment, version/status, rules, create/edit/preview                 | Error list shell; actual create dialog and 2/9-item geometry desktop/mobile; no save; photo-rule editor source-only                     |
| Audit / actions and events   | Filters, capped scope, diff/raw evidence, detail tables                       | Both tabs desktop/mobile; actions populated, events empty; no server-wide archive search claim                                          |
| Profile and sign-in/security | Name/photo, roles, theme, TOTP/backup codes, login                            | Mobile profile clipping; desktop production profile only for identity check; login/TOTP recovery source-only                            |
| Shell / help / shortcuts     | Navigation, mobile drawer, FAQ, global message, deep links                    | Desktop/mobile navigation, quick-create wrong destination, keyboard disclosure; FAQ and message workflows source-only                   |

Current source has **24 DataTable call sites**: Operations 1, Handover 1, Incidents list 1 and reused
StatsTable 1, Requests 2, Photo library 1, Reports 2, Bonus 3, Employees 1, import 1, Users 1,
Directories 5, Terminals 1, Checklists 1, Audit 2. StatsTable renders two datasets. Schedule uses a
separate editable matrix; Audit also has two compact evidence tables. The old Knowledge bookmark
redirects into Incidents and is not a twelfth section. The earlier count of 23 is historical.

### Reproducible browser observations

| Check                             | Steps and observed result                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 — wrong-user draft            | Users → expand fake account A → enter `AUDIT DRAFT A` → expand fake account B. B's name input contains A's text. Nothing saved.                                                                                             |
| R02 — lost navigation draft       | Requests → expand fixture vacation request → enter `AUDIT unsaved draft` → Reports → Requests. Input is empty; no leave warning appeared.                                                                                   |
| R03 — wrong palette target        | Profile → Quick jump → Create checklist. Final hash is `#/administration`, selected tab is Employees, and no creation dialog exists.                                                                                        |
| R04 — narrow checklist input      | At 390×844, open Create checklist. First item text input measures **22 px wide**; type selector and reorder/delete controls consume the row.                                                                                |
| R05 — oversized dialog            | At 1440×700, add seven blank items to the initial two. Dialog measures **896×841**, top **−70.5**, bottom **770.5**, `overflow-y: visible`. Title/close and footer lie outside the viewport.                                |
| R06 — profile clipping            | At 390×844, even the fixture `admin@example.com` and role scope extend past the visible profile card. Avatar/name/detail columns have insufficient available width.                                                         |
| R07 — false analytical result     | Reports shows a completeness-error/retry block alongside `0` time/loss, `0%` and a no-intervals message. Mock failure itself is not a production bug; the render response to unavailable data is the finding.               |
| R08 — mobile density              | At 390×844 and top of Operations, the first record begins around y=750; Employees around y=697. Shared help, scope/filter controls and sort dominate the first screen. Preview footer is excluded from the product finding. |
| R09 — semantic handover evidence  | Native accessibility tree exposes checklist labels but not successful versus unanswered icon state; source sets those icons `aria-hidden`. No VoiceOver session claimed.                                                    |
| R10 — preserved keyboard behavior | Enter on Handover disclosure opens details. Escape from its comment input closes them and restores focus to the disclosure (`aria-expanded=false`). Escape while already on the disclosure was not counted as this check.   |
| R11 — enabled success color       | Requests Approve computed style: white, 14 px, weight 500, background `oklch(0.596 0.145 163.225)`, enabled. Source conversion estimates about 3.67:1; not a screenshot-pixel/gamut-certified ratio.                        |

Console warnings confirmed missing photo/checklist fixtures. The preview's SSE indicator is disconnected
by design, its dates are static and its locale query can initialize after module-level translations;
these are not promoted to production defects. No performance trace or comprehensive multilingual
runtime check was performed. Physical phones, screen readers, multiple real roles, 200% text sizing,
populated schedule/photo states and production failure recovery still require targeted verification.

## Prioritized findings and acceptance criteria

Paths in this section are relative to `apps/admin-web/src`, except explicit repository paths. Line
references describe the baseline above. Related manifestations are grouped to avoid counting duplicates.

### UX01 · P1 · User editing drafts can target another account

**Runtime R01 + source:** `admin/UsersTab.tsx:66–71,94–102,239–253,307–346,507–513`.
Name and role-replacement state belong to the page, while opening another row changes the user.
A's name draft appears under B; the next save targets B. Role replacement also retains the previous
grant context; its server outcome is not asserted. `draftName || user.name` additionally prevents an
intentional empty string from being a valid draft state.

**Required result:** Own the editor by user ID and initialize explicit Edit/Replace modes. A→B→A
never transfers text, role scope or grant ID. Preserve A's draft or deliberately discard it. Empty
input stays empty with validation. Successful saving clears only the matching record's draft.

### UX02 · P1 · Request decision fields cross request boundaries

**Source:** `requests/RequestsPage.tsx:65–73,133–151,310–400,468–475`.
Comment, approved minutes, correction time/type/interval are page-wide. Selecting request B changes
only the open ID, so B can inherit A's decision inputs, including a different shift's interval.

**Required result:** A request-ID-owned draft with record-valid correction choices. Test two request
types, two shifts, polling reorder, filtering and deep links. A submitted target and every draft field
must belong to the same request. Decide retention/discard explicitly; do not silently move the draft.

### UX03 · P1 · Failed decisions erase retry input

**Source:** `requests/RequestsPage.tsx:133–151` clears comment/minutes before `decision.mutate`.
A network refusal or conflict leaves the decision incomplete and its explanation unavailable to retry.

**Required result:** Retain the exact draft during failure and clear only the successfully submitted
snapshot for that request. A late success must not erase newer edits. Test network, validation and
conflict errors plus retry and success; mutation failure was not injected in production during audit.

### UX04 · P1 · Pairing code display uses a nonunique terminal name

**Source:** `admin/TerminalsTab.tsx:96,106,285–314` compares `pairing.name` to the open terminal name.
`packages/db/src/schema/attendance.ts:14–32` has no unique-name constraint; registration in
`apps/api/src/org/org.service.ts:300–312` adds no such check. Two terminals with the same name can
display one terminal's issued code under the other. The API already returns `terminalId`
(`packages/contracts/src/org.ts:105–109`), retained by the frontend.

**Required result:** Compare the existing terminal ID. Verify duplicate names across sites, rename,
and switching records. The wrong terminal must never show another ID's pairing material. No actual
pairing code was generated, recorded or reproduced in this audit.

### UX05 · P2 · Historical schedules lose inactive employees' names

**Source:** `schedule/SchedulePage.tsx:65,612–616`; `schedule/ScheduleGrid.tsx:56,59,196–209`.
Only active employees reach the grid's lookup, so saved rows for blocked/terminated staff fall back
to UUIDs and lose personnel numbers/accessible cell identity.

**Required result:** Resolve existing rows with the full authorized employee collection. Keep the
grid's existing ACTIVE-only Add eligibility. Test published/superseded schedules with inactive staff;
historical names remain readable without making those people eligible for new assignments.

### UX06 · P2 · Quick jump loses its intended tab and action

**Runtime R03 + source:** `App.tsx:354–366`; `components/app/command-palette.tsx:97–119,214–247`;
`lib/route.ts:53–60`. A subroute write is immediately overwritten by `setActive(section)`.
Terminal results lack terminal IDs; Create/Register entries contain no creation intent.

**Required result:** One navigation transaction carries section, tab, record or explicit create intent.
Test every palette target from another section and the same section. URL, selected tab, visible record
and promised form agree, including retained filters that might otherwise hide the target.

### UX07 · P2 · Bonus retains an invalid dependent filter

**Source:** `bonus/BonusPage.tsx:48–89,253–276`. Switching site retains its former unit; an apparently
unselected control can still filter using that hidden ID. History unit choices also come from the
independent points-month result.

**Required result:** Atomically clear invalid unit scope on site change and validate restored values.
Use an organization/history-appropriate source for history choices. Test two sites and a historical
unit absent from the current points month. Operations/Reports already show the correct reset pattern.

### UX08 · P2 · Unknown data looks like zero activity or missing configuration

**Runtime R07 + source:** `reports/ReportsPage.tsx:251–280`; `bonus/BonusPage.tsx:63–93,291–307`;
`admin/EmployeesTab.tsx:90–94,335–342`; `operations/OperationsPage.tsx:117,562–573`.
Summary fallbacks manufacture zeros/no records before success. Secondary queries also collapse
unavailable checklists/employee rosters into empty collections.

**Required result:** Bind the complete dependent surface to initial, paused, error, success-empty,
refresh and cached-error state. Only successful data can establish zero/missing configuration. Keep
cached results and input during refresh/error; show one labeled shared LoadingState per surface.
Test failures of secondary queries independently of the main table.

### UX09 · P2 · Read-only roles are offered unusable actions and destinations

**Source:** `App.tsx:182–194,247–268`; `requests/RequestsPage.tsx:250–289,310–400`;
`apps/api/src/requests/admin-requests.controller.ts:38–39,48,79,117`.
Shell filtering covers Photo library but not all restricted destinations. Decision forms depend on
request state without matching the viewer's decision capabilities. Backend authorization still applies;
this is false affordance, not a demonstrated authorization bypass.

**Required result:** A documented role/capability matrix controls navigation and decision/read views.
Authorized readers see evidence; permitted deciders see their valid next action. Verify inbox/all,
correction/overtime and admin roles against real authorized sessions before shipping a role change.

### UX10 · P2 · Enabled actions can silently do nothing

**Source:** `features/incident-management/ui/incident-detail.tsx:177–180` and `features/incident-management/model/workspace.ts:142–147`;
`requests/RequestsPage.tsx:136–138,155–157,395–399`; `schedule/SchedulePage.tsx:382–387,600–607`.
Unchanged Incident Save and invalid Request Reject remain enabled while their handlers return.
Reject bypasses native submit validation. Rotation can similarly be offered without its day template.

**Required result:** Share normalized change/validity rules between native `disabled` and handler
guards, with keyboard-accessible prerequisite explanations. Test unchanged/reverted drafts, short and
whitespace comments, missing templates and pending state. Useful Refresh/Retry is an explicit exception.

### UX11 · P2 · Handover answer states lack equivalent accessible text

**Runtime R09 + source:** `handover/HandoverPage.tsx:215–233` hides pass/unanswered icons from the
accessibility tree while leaving identical item-label text. A reviewer cannot distinguish those states.

**Required result:** Localized pass/unanswered/problem text accompanies the decorative indicator.
Check the accessibility tree and a screen reader for all states. Relevant authority: WCAG 2.2 SC 1.1.1;
see the [W3C explanation](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html).

### UX12 · P2 · Connection state relies on color at rest

**Runtime visual observation + source:** `components/app/page.tsx:92–124`. Live/disconnected states
share a dot shape; words are in a tooltip/accessibility label. Touch users or people unable to
distinguish the colors must discover the tooltip to understand freshness.

**Required result:** A distinct shape/icon and compact state text or equally clear non-color cue,
with reachable recovery guidance. Preserve concise accessible announcements. The preview's deliberate
disconnection is only the observed presentation, not a production connectivity finding.

### UX13 · P2 · Ordinary edits lack consistent navigation protection

**Runtime R02 + source:** `operations/OperationsPage.tsx:125–132`; `handover/HandoverPage.tsx:89–95`;
`admin/EmployeesTab.tsx:1068`; `auth/ProfilePanel.tsx:80–81`; `lib/unsaved.ts:21–33`.
Calling the shared leave helper does not protect forms that never register their local drafts.

**Required result:** Choose record-owned retention or shared dirty registration for each real editor.
Verify section navigation, row collapse, cancel, reverted edits and success. Reuse existing external
store/callback-ref patterns. Schedule/checklist persisted drafts and the photo editor's own guards
are precedents, not targets for redundant prompts.

### UX14 · P2 · Long dialogs exceed laptop viewports

**Runtime R05 + source:** `components/ui/dialog.tsx:57–64`; `admin/ChecklistsTab.tsx:515–665`.
Height/scroll constraints apply only below the desktop breakpoint. Nine checklist items create a
dialog taller than a 700 px viewport, with close/title and footer outside it.

**Required result:** Viewport-bounded dialog scrolling at all widths, retaining the specialized image
editor override. Test long forms at 1440×700, 1024×600 and 390×844; every field/action and a close path
remain reachable with keyboard and pointer. Relevant reflow guidance is listed below; a full WCAG
conformance claim requires the specified zoom/reflow checks.

### UX15 · P2 · Mobile checklist text fields become unusably narrow

**Runtime R04 + source:** `admin/ChecklistsTab.tsx:601–665`. One nonwrapping row holds number, text,
type and three icon controls. At 390 px its text input is only 22 px wide.

**Required result:** A narrow-screen arrangement gives text its own useful line and groups type/reorder
actions below. Keep the same primitives and stable item identity. Test 320/390 px, long localized text,
validation messages, keyboard reorder and text sizing; all editing controls remain visible and usable.

### UX16 · P2 · Profile details are clipped on a phone

**Runtime R06 + source:** `auth/ProfilePanel.tsx:152–184`. The avatar and form columns plus the inner
label/value grid leave too little width even for the preview email and enterprise role.

**Required result:** Stack the outer profile layout at narrow widths; use zero-minimum grid tracks and
wrapping for values. Preserve the full email/scope rather than truncating its only representation.
Verify ordinary and long values at 320/390 px and enlarged text, including photo controls and save.

### UX17 · P2 · Success-button contrast needs correction

**Runtime computed style R11 + source:** `components/ui/button.tsx:7,20–22`. White normal-size text
uses emerald-600, with emerald-500 on dark hover. Source-derived sRGB estimates are about 3.67:1 and
2.46:1; exact browser gamut mapping was not pixel-measured.

**Required result:** Accessible semantic foreground/background/hover tokens for enabled success
buttons. Measure final rendered combinations in both themes and interaction states against the
4.5:1 normal-text threshold in [WCAG SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Do not classify disabled controls using the enabled-text requirement.

### UX18 · P2 · Visual section titles are missing from heading navigation

**Source + observed DOM:** `components/app/page.tsx:45–56`; `components/ui/card.tsx:35–40`.
Section titles are styled `div` elements; major report/bonus/profile subdivisions cannot be navigated
as headings even though details contain h3 elements.

**Required result:** Let the shared Section express the intended heading level under the page h1.
Verify representative heading outlines; do not turn every card label into a heading mechanically.
The relevant relationship requirement is [WCAG SC 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).

### UX19 · P2 · Navigation loses native link and Back behavior

**Source/proposal:** `App.tsx:249–257`; `lib/route.ts:52–60,93–105`. Section destinations are buttons,
so copying/opening links in another tab is unavailable; all route writes replace the history entry.
Back cannot retrace a normal investigation through panel sections. The controls are still keyboard
operable; this is not asserted as a WCAG failure.

**Required result:** Use actual destination links and distinguish meaningful navigation from URL
normalization. Test modified-click, copied destinations, Back/Forward, old bookmark redirects and
dirty-form protection. No new router library is required by this recommendation.

### UX20 · P2 · Operational choices expose implementation language

**Source:** `requests/RequestsPage.tsx:334–341,413–422`. Correction choices display `CLOSE_SHIFT_AT`,
`MOVE_BOUNDARY`, `RECLASSIFY`; history displays raw step/role codes. Mobile sidebar/command-dialog
assistive descriptions also retain generic English scaffolding in Ukrainian UI.

**Required result:** Human-readable labels and consequences in all three catalogs, retaining original
DTO values. Translate helper descriptions and operational history consistently. Technical identifiers
may remain in Audit where they support evidence. The preview locale-initialization artifact is excluded.

### UX21 · P2 · Photo-library navigation and filters diverge from the list contract

**Source/pattern gap:** `pages/photo-library/ui/photo-library-page.tsx:24–110,131–144`;
`pages/photo-library/model/use-library.ts:7–12,32–48`. Filter order differs, component-local intent resets on leaving,
and comparable columns have no declared sorting. Explicit server Apply and normalized Reset are good.

**Required result:** Consistent composition and valid retained intent. Document supported global sort
capabilities; adding sorting requires server support and stable tie-breakers. Never fake global sorting
on one loaded page. Preserve server total/pagination and the independent annotation task.

### UX22 · P2 · Filter/search/refresh labels do not explain their scope

**Source/pattern gap:** `bonus/BonusPage.tsx:69–81,430–439,485–519`; `audit/AuditPage.tsx:177–183,305–312`.
Bonus offers overlapping employee searches affecting server/export versus loaded rows. Audit Show
actually refreshes already locally filtered data.

**Required result:** Every control names its dataset and commitment model. Keep two searches only
when their distinct tasks are clear; disclose loaded-subset limits. Rename Audit's action Refresh
unless a real draft/apply interaction is justified. Test which totals and exports each control affects.

### UX23 · P3 · Repeated help and tall mobile toolbars delay the work

**Runtime R08 + proposal:** `App.tsx` header; `components/app/how-it-works.tsx`;
`operations/OperationsPage.tsx` toolbar; `admin/EmployeesTab.tsx` header.
Header FAQ and the separate help card repeat the entry point. Stacked scope controls and sorting push
the first operational record near the bottom of a phone screen; Bonus has several overview blocks
before exact employee records. The layout is readable but costly for repeated queue checking.

**Proposed result:** Keep help accessible while reducing its persistent footprint. Prototype a compact
scope summary with expandable secondary filters and task-appropriate KPI grouping using existing
primitives. Active filters and result scope must remain visible; critical actions/evidence stay discoverable.
Compare the current and proposed layouts with masters performing real tasks. No percentage time saving
or arbitrary maximum number of controls is claimed.

### UX24 · P3 · Documentation can send new pages toward obsolete patterns

**Source:** `docs/features/11-admin-panel.md` contains both right-side detail and inline-detail wording;
the table feature memory still names 23 call sites. Directory/legacy Knowledge descriptions also drift.

**Required result:** Reconcile historical prose with the current canonical standard, link dated audit
evidence, and record justified exceptions in one place. Do not implement obsolete product features
solely to make old prose true. This audit updates the inventory pointer; broader wording reconciliation
belongs with the accepted pattern changes.

## Proposed page-pattern contract

The existing [table/filter standard](../../engineering/table-filter-standard.md) remains canonical.
The following is a concrete composition proposal to incorporate there when implemented, not a competing
design system. The design unit is a recurring user task, not just a reusable CSS shape.

| Pattern                | Composition and required invariant                                                                                                                               | Existing building blocks / exceptions                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Operational queue      | Page title → compact context/help → organization/date → task state → text search → named collection → count. Record identity and deadline are easy to scan.      | Page/Toolbar, StateFilter, DataTable, RowDetail; Operations, Handover, Requests and Incidents       |
| Administration list    | Title and explicit Create/Import → scope/search → selection and collection → count. Inspection and Edit/Grant are distinct intents; drafts belong to record IDs. | Section, AddDialog, shared selection/paginator, explicit edit dialogs                               |
| Analytics              | Scope/period and export → truthful query state → meaningful summary → chart plus equivalent detailed data. Every number exposes period, unit and completeness.   | Existing chart/table pair, QueryFeedback and TableCount; nominations remain a single month          |
| Editable matrix        | Context/version/status → valid scoped employees/days → changes count → save/publish. Identity lookup is separate from add eligibility.                           | Keep Schedule's employee×day matrix and its existing draft model; horizontal scrolling is justified |
| Evidence/detail        | Identity stays anchored in the parent row; grouped evidence/history before a permitted decision; full text remains available.                                    | RowDetail, DetailText, ScrollableText, photo viewer; final operational records render read-only     |
| Media review           | Image/annotation and review fields form one specialized task with explicit save/close/conflict handling.                                                         | Keep photo-inspection dialog and independent human review of historical photos                      |
| Small create/edit form | Record-aware title → labeled fields/errors → explicit Cancel and useful Save. Long forms fit every viewport.                                                     | Existing form context, Zod, AddDialog; no new generic form system                                   |

### Requirements to use for every page review

| ID  | Requirement                                                                                                          | Acceptance evidence                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| P01 | Define primary task, reader/decider roles, scope and success outcome before arranging controls.                      | One task statement and capability matrix tied to existing backend rules               |
| P02 | Consistent scope → period → state → text order; task tabs are not state filters.                                     | Side-by-side comparison with the relevant existing page family                        |
| P03 | Declare immediate filtering, draft/apply and explicit refresh separately. Clear invalid dependent values atomically. | Changed/reverted/restored/default and multi-site cases; no hidden active filter       |
| P04 | Declare server/client scope of search, sorting, count, pagination and export.                                        | One matching row beyond the first page/cap; totals/export have explained scope        |
| P05 | Record identity owns editors, selection and in-flight results; display names never act as keys.                      | A→B→A, rename, duplicate label, polling reorder and late-response checks              |
| P06 | Preserve drafts on failure; define navigation/collapse behavior and late-success clearing.                           | Failure/retry, dirty navigation/cancel, reverted draft and newer-edit cases           |
| P07 | Initial load, paused/offline, error, successful empty, cached refresh/error and saving are different states.         | State matrix for every independent query surface, including secondary lookups         |
| P08 | Actions reflect permissions, validity, actual changes and pending work; handlers agree.                              | Native disabled and accessible reason; no silent no-op; useful retry still works      |
| P09 | Collections share identity-first desktop/mobile behavior, sorting/selection/count and bounded full details.          | Same task completed at desktop and phone widths; no page-local table fork             |
| P10 | Consequential status is understandable without color; headings, labels, errors and answer states have semantics.     | Keyboard and accessibility-tree checks plus targeted screen-reader verification       |
| P11 | Text and enabled controls meet contrast requirements; focus remains visible and content reachable.                   | Both themes, interaction states, 320/390 px, short laptop viewport and enlarged text  |
| P12 | Localize meaningful labels, units, dates and error recovery; technical codes belong only in technical evidence.      | uk/en/ru, long labels, timezone/date boundaries, full untruncated evidence            |
| P13 | Retain canonical tokens/primitives and feature ownership. Add a shared abstraction only for the same stable concept. | Existing architecture and public APIs respected; no unrelated migration or second kit |
| P14 | Performance claims require measurement against representative datasets/devices.                                      | Trace or repeatable measurement before virtualization/memoization/package changes     |

A reusable page specification should record: task/persona; current versus expected behavior; route and
capabilities; data and filter scope; state ownership; mobile composition; async/empty/error states;
keyboard/assistive behavior; acceptance cases; existing components; and any justified exception.

## Delivery order and verification plan

1. **Protect identity and work:** UX01–04, UX05 and UX13. Fix record-owned drafts, mutation clearing,
   terminal-ID matching and historical identity. Focused behavior/invariant tests and independent review
   are required for attendance/access/recovery paths before any release.
2. **Make outcomes and actions trustworthy:** UX06–10 and UX22. Repair navigation intent, dependency
   resets, role affordances, unknown-data states and action/search vocabulary. Verify full target/scope
   behavior, not just button screenshots.
3. **Make real forms usable and accessible:** UX11–12 and UX14–20. Reuse shared dialog/status/heading/
   button primitives; adapt checklist/profile geometry. Pair source tests with desktop/mobile and
   assistive checks. Validate actual contrast rather than repeating this estimate.
4. **Standardize composition:** UX21, UX23–24. Pilot one operational queue and one administration list,
   document them in the existing standard, then apply only to corresponding families. Measure operator
   tasks before expanding the pattern. Keep Schedule, photo review and audit evidence exceptions.

Use Impeccable critique/audit to review a bounded task, then harden for state/error work, adapt for
verified layout issues, clarify for labels, and polish after substantive acceptance criteria pass.
Use web-design-guidelines as the final implementation checklist. Do not run every command on every
page mechanically; the issue and its acceptance criteria choose the needed pass.

Lean recommendation: **Simplify**. Remove reconstruction of lost comments, wrong-target navigation,
hidden-scope reconciliation and repetitive help footprint. Add no worker input or Telegram steps.
Actual task-time, throughput or OEE improvements require observation and are not established here.

This delivery changes documentation only. Product typecheck, lint, unit tests and build are not rerun
for the audit artifact; document formatting, source-reference existence and diff checks are the
proportionate local checks. This statement does not claim the identified product defects are fixed.

## Basis and limits of recommendations

The normative accessibility baseline is [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Referenced W3C
Understanding pages explain its criteria; they are informative guidance. Relevant checks include
[reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), non-text alternatives, contrast and
information relationships. A complete accessibility evaluation requires more than this audit's sample.

[Nielsen's ten heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) provide the
expert-review framework for feedback, consistency, error prevention/recovery and user control. These
are established heuristics, not proof that a particular layout will improve this product's task time.
[IBM Carbon's data-table guidance](https://carbondesignsystem.com/components/data-table/usage/)
provides a mature enterprise-table reference for collection/toolbars/selection/expansion; it does not
require copying Carbon styling or adopting every available feature.
[Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
are a practical implementation checklist, not a normative UX standard. Sources were checked 2026-09-12.

Open questions intentionally kept outside the confirmed backlog: actual TOTP backup-code recovery,
whether Incident statistics intentionally use a broader scope than the list, physical phone photo
editing, complete archive browsing beyond disclosed caps, and role-specific workflows on real QA
accounts. Do not solve these by inventing product requirements during unrelated fixes.

## Implementation follow-up — review workspaces

The owner subsequently authorized implementing the modal/expanded-row redesign. See
[Admin review workspaces](../../engineering/features/admin-review-workspaces.md) for the specification,
architecture and executed checks. This delivery addresses dialog height (UX14), mobile checklist input
layout (UX15), and the newly supplied photo-review/rules screenshots. The baseline counts and evidence
above are preserved; remaining correctness/accessibility findings are still backlog.

Shared RowDetail uses available width. Handover places evidence beside the decision on wide screens
and uses full width for completed reports. Photo review separates its action footer from content,
fits images without initial panning, and places previous/next beside the image on desktop and below it
on mobile. Saved rules appear before explicit editing; the rules list no longer has its own scrollbar.
Synthetic photo/rules/checklist preview fixtures were added after the audit; their earlier coverage
gaps describe the baseline preview, not this follow-up's local visual checks.
