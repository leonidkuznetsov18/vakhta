# Feature: organization tree in Directories

## Outcome and scope

Administrators reading the units directory as a flat table cannot see which unit belongs to which,
nor who works where. The Directories tab gains a "Таблица / Дерево" switch: the tree shows
site → unit → sub-unit → people, with the unit's shift master and headcount. Read-only apart from
the existing "assign master" action; no new API, no changes to units, positions or access.

## Current behavior and ownership

Product document: `docs/features/11-admin-panel.md` ("Справочники"). Slice:
`apps/admin-web/src/features/org-structure/` — `model/unit-tree.ts` (pure: `buildOrgTree`,
`filterOrgTree`, `countOrgTree`) and `ui/org-tree.tsx` (`OrgTree`). The legacy
`admin/DirectoriesTab.tsx` owns the switch (`usePersistentState('directories.unitsView')`) and the
roster query (`profileDirectoryOptions()` from `features/employee-profile`, enabled only in tree
view) and passes both into `OrgTree`, so the new slice never imports a peer feature.

Rules in the model: a unit hangs under its `parentId` only when that parent exists on the same
site, otherwise it is a root of its site; units caught in a parent cycle are attached as roots after
the site pass; people come from `currentPosition.orgUnitId`, `TERMINATED` employees are excluded;
every level sorts by name in the UI locale. Search keeps a matching unit with its whole subtree,
otherwise only matching people and their ancestor units.

## Decisions and reuse

- Reused `StateFilter`, `TableSearch`, `QueryFeedback`, `EmployeeProfileLink`, `Collapsible`,
  `StatusPill` and `InfoTip`; no new primitives. The tree is a nested list with Radix collapsibles
  (`aria-expanded` on each branch), not an ARIA `tree` widget, because it needs no roving focus.
- Hand-collapsed branches reopen when the search changes: the list is keyed by the query.
- The roster read is deferred until the tree is chosen so the table view costs nothing extra.
- Messages: `admin.administration.directories.{view,viewTable,viewTree,treeEmployees,
treeNoEmployees,treeNoUnits}` and `ui.hints.directoriesTree` in all three catalogs.

## Verification

2026-09-22, local: `pnpm --filter @vakhta/i18n build && test` (catalog parity), admin-web
`typecheck`, `eslint` on the changed files (no new suppressions), `vitest` for
`features/org-structure` (model: nesting, sorting, terminated exclusion, cycle and foreign-parent
roots, headcount, search; UI: structure, collapse, master action, search, empty and loading states).
Visual check on the local stack (Docker PostgreSQL/Redis/MinIO, local API, Vite panel, throwaway local
admin): desktop and 375 px mobile views of the tree with a nested unit, the search narrowing to one
person, the count line, and the table view restored by the switch. Not yet inspected on the deployed
panel at the time of writing.

## Remaining work

- Teams and zones are not drawn in the tree; add them only if the owner asks.
- `DirectoriesTab.tsx` keeps its pre-existing complexity suppressions; the units section could move
  into the `org-structure` slice when that tab is migrated.
