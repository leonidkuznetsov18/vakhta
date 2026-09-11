# Feature: shared tables, filters and keyboard interaction

## Outcome and scope

Implement the [site-wide standard](../table-filter-standard.md) for the
[admin panel](../../features/11-admin-panel.md), preserving existing business statuses, permissions,
exports and evidence. Masters can use the same inspection, sorting, selection and pagination controls
on desktop and mobile. Kiosk and worker Telegram behavior are outside this presentation change.

## Current behavior and ownership

`components/app/data-table.tsx` is the shared renderer for all 23 production call sites.
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

## Remaining work

Audit/request capped endpoints still need server count/search/pagination for complete archive browsing;
the UI explicitly discloses their limits. Validate representative tasks with masters on physical phones
and assistive technology. Do not introduce additional controls or change domain semantics to address
those follow-ups. Release/deployment outcome is reported with the delivery.
