# Specification: Standard panel routing

Status: accepted. Owner/writer/integration owner: Codex. Baseline: 5689729.
Authorized scope: owner requested a specification, plan and complete TanStack Router migration.

## RECON

The panel implements hash parsing, history writes, subscriptions and page selection itself in
`lib/route.ts` and `App.tsx`. Open record IDs also fall back to persisted UI state. The mobile
communications workspace writes raw history entries independently. Navigation originates in sidebar
links, command search, page shortcuts, tabs and record links.

The original intermittent Overview/Schedule mismatch has not been reproduced; previous regression
checks passed before the previous fix. Migration is an authorized architecture improvement, not proof
of that historical root cause. Product: `docs/features/mobile-panel.md`; evidence:
`docs/engineering/features/mobile-panel.md`.

## SPEC

1. TanStack Router is the sole route/history owner. Remove handwritten URL subscriptions, route
   parsing and page switching. Use documented route definitions, Outlet, Link and navigation APIs.
2. Preserve all existing sections and `#/section[/tab-or-id[/detail]]` links, including retired
   incidentKnowledge bookmarks. Empty/unknown URLs resolve canonically to Overview. Invalid admin
   and audit tabs resolve to their existing defaults.
3. URL determines current page, sidebar selection, tab and URL-linked record (Operations, Handover,
   Requests, Incidents and admin detail routes). An absent record ID means
   no selected record, even when old persisted state exists. Incident statistics keeps the queue
   return ID explicitly in URL search state; drafts and filters keep their existing ownership.
4. Section changes push history. Tabs, expanded rows and same-section record links replace it.
   Reload/direct entry, rapid navigation, Back/Forward and repeated mobile navigation agree.
5. Standard links preserve keyboard and modified-click/new-tab behavior. A successful sidebar
   selection closes the mobile menu, including selection of the current page. Canceled navigation
   leaves the menu, page and selected record unchanged.
6. Unsaved-change blocking covers router links, imperative navigation and browser Back/Forward.
   Keep existing before-unload protection and do not prompt twice for one route transition.
7. Mobile communications continues to minimize on Back without losing drafts or adding corrupt
   history indices. Use the router's history instance; retain desktop behavior and focus restoration.
8. Preserve authentication gates, role visibility, query ownership, target filter presets, employee
   and checklist deep links, questionnaire entry, localization, gesture and layout behavior.
9. No forbidden React hooks, parallel route stores, forced page remounts, cache clearing, timers as
   navigation fixes, generic routing facade, or unrelated feature migration.

Contextual directory sheets and inline configuration editors remain local UI; they never determine
the current route. Command search opens checklist details by URL.

Non-goals: clean pathname URLs, SSR/Next.js, redesign, new backend/API behavior, migrating all filters
into the URL, rewriting existing business pages. No unresolved product decision blocks implementation.

## Acceptance evidence

Regression tests cover criteria 2–7, plus authenticated/anonymous rendering. Browser QA checks actual
Overview/Schedule content, sidebar selection, nested links, reload, rapid transitions and history at
mobile and desktop sizes, with inspected screenshots. Typecheck, changed-file lint, panel tests and
production build pass. Full integration CI, deployment and existing release announcement are checked
after one coherent direct-master push. Physical device verification is reported separately.
