# Consistent panel feedback and readable details

Owner requirements, 2026-09-10: show accurate loading/error/saving feedback, use one calendar UI,
keep expanded rows readable on desktop/mobile, and visually inspect screenshots after UI changes.

## Implementation

- DataTable accepts the real Query state. Initial fetch shows the shared Spinner; offline/paused reads show
  a connection message; failures show a localized error and explicit retry. A successful empty read
  alone shows the empty message. Cached rows remain available during refresh or a failed refetch.
- Handover, operations, requests/overtime, incidents/knowledge, reports, bonus, audit, users, employees
  and checklists bind their list queries. Details retain query metadata rather than discarding errors.
  Correction forms wait for the required shift context; failed position history does not become an
  empty assignment form. Directory, schedule, photo-link, QR and command-search failures expose retry.
- The shared mutation indicator announces saving without automatic mutation retries. Existing form
  errors preserve input. Partial overview failures stay unknown rather than becoming zero and offer retry.
- RowDetail bounds every expanded desktop row/mobile card. TextPreview limits previews to two lines;
  DetailText/ScrollableText preserve full text and newlines in a keyboard-scrollable container.
  Plain textual table cells wrap; audit and report prose follow the same rule. Reading a mobile detail
  does not toggle its parent row closed.
- CalendarPeriodField reuses the Schedule calendar primitives; period modes live inside the popover.
  All-time remains the incident default. No new forbidden React hooks or dependencies were introduced.

## Verification

The final focused panel suite passed 68 tests across 16 files; affected lint and type checks passed.
Shared-table regressions cover loading, error/retry, offline, successful empty results, retained cached
rows, and mobile detail interaction. Incident filter tests protect timezone/API boundaries; calendar
interaction is exercised in the browser rather than jsdom's expensive focus/layout simulation.
Local browser screenshots use actual shared components with clearly labeled synthetic data at
1440x1000 and 390x844. They cover calendar year selection, two-line previews, long text/newlines,
long unbroken words, expanded mobile cards, loading and error/retry. The mobile document and content
width both measured 390px; the full text container measured 238px high with 1571px of scrollable content
and no horizontal overflow. Browser inspection caught and removed a conflicting display utility that
prevented line clamping. Live production verification is separate from this fixture evidence.

## Lean recommendation

Proceed: consistent visual states remove uncertainty and unnecessary repeated clicks. Keep existing
worker workflows and recorded business decisions unchanged. Validate only affected surfaces; do not
create artificial production incidents, shifts or messages for screenshots.

## 2026-09-10 — One Spinner loading presentation

Owner requirement: remove skeleton placeholders and use the existing shadcn Spinner everywhere.
`shared/ui/loading-state.tsx` owns the animation wrapper, localized accessible status and optional
operation label. Initial app/table/photo/QR states, Query feedback, mutation activity, retry buttons
and Sonner loading icons reuse it. Overview uses its existing QueryFeedback once instead of also
rendering six loading cards. Unused sidebar skeleton and Skeleton primitive were removed. Spinner
is now the only animation implementation; no pulse placeholders remain in panel source.

Loading presentation changes do not alter requests, mutation retries, cached data, error/offline states
or successful empty results. Five table-state regressions, panel typecheck and affected lint passed.
Actual shared components with synthetic pending requests were captured and visually inspected at
390×844 and 1440×1000: page, table, photo, QR, refreshing and saving all use the same animated icon;
no skeletons or horizontal page overflow. Production publication is checked separately.
Lean: Proceed. Consistent feedback reduces visual noise and ambiguity without extra worker actions.

## 2026-09-10 — Help collapsed by default

The shared HowItWorks component now defaults to collapsed for both regular and compact layouts.
Existing explicit per-section preferences remain remembered in the Zustand UI store; the toggle and
FAQ entry points are unchanged. Two focused component tests passed. Actual component screenshots
were inspected at 390x844 and 1440x1000, with expansion and collapse checked in the browser.
Lean: proceed; keep the workspace visible on arrival and reveal instructions only when requested.

## 2026-09-10 — Always-visible table totals

Owner request: show the collection length below every table, including a six-row handover list and
paginated collections such as 186 records with ten visible at once. The shared Paginator previously
returned null for ten or fewer records, hiding its existing total.

A shared TableCount now renders the localized visible range and complete filtered total. DataTable
and ScheduleGrid use it through Paginator; audit field/payload tables reuse it directly. Successful
empty collections show zero; initial loading, failures without cached data and unselected parameters
continue to show their actual query feedback instead of an invented zero. Client search changes the
filtered total; page changes, page size and expanded details do not change the underlying count.
No server-total contract was invented: these tables paginate their supplied collections locally;
existing history API caps still bound those collections.

Small lists display only their count. Larger lists retain page-size and navigation controls, which
wrap on mobile. Pagination uses the primitive's text prop and localized accessible labels (children
were previously ignored and showed English defaults). Existing UI strings are reused in all locales.

Verification: nine focused DataTable tests pass, including small desktop/mobile totals, 186 records
across page/size changes, filtered seven/zero results, and loading versus successful-empty behavior.
Real components captured and inspected at 1440x1000 and 390x844: six-row total visible, paginated total
186 retained, mobile document width 390px with controls wrapping below the count.
Lean: proceed; show queue size without manual counting or changing page size. No additional input.
