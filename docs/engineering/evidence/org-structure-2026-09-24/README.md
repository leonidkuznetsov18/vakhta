# Org structure prototype captures, 2026-09-24

Fixture-rendered states of the Оргструктура section (spec 014), captured by
`apps/admin-web/e2e/units.spec.ts` from `apps/admin-web/e2e/units.html?state=<key>` on the
preinstalled Chromium. Desktop is 1440 px; mobile is iPhone 13 (390 px). Prototype copy is
Russian, the base UI language.

## Section root and filters

Overview: tree with kinds, heads and subtree counts; summary counts inline, actionable counts as
chips.

![Overview, desktop](overview-desktop.jpg)

Attention filter: nodes without a head, with an inactive or transferred responsible.

![Attention filter, desktop](attention-desktop.jpg)

Search across people and nodes, and a search hit that opens the person's node.

![Search, desktop](search-desktop.jpg)

![Search hit, desktop](search-hit-desktop.jpg)

Collapsed tree.

![Collapsed tree, desktop](collapsed-desktop.jpg)

## Node detail

Section «Линия 1»: breadcrumb, kind, facts, responsibles with inherited shift masters, pay
conditions (spec 015), people, history.

![Section detail, desktop](section-desktop.jpg)

Node menu (edit, add child, move, shifts, archive).

![Node menu, desktop](menu-desktop.jpg)

History of versions and responsible changes (R40).

![History, desktop](history-desktop.jpg)

## Responsibles

Head picker popover.

![Head picker, desktop](head-desktop.jpg)

Responsible works elsewhere.

![Responsible elsewhere, desktop](head-elsewhere-desktop.jpg)

Responsible inactive (blocked or terminated).

![Responsible inactive, desktop](head-inactive-desktop.jpg)

## Placing and moving people

Move a person with an effective date and the position kept.

![Move popover, desktop](move-desktop.jpg)

Pool «Без подразделения» with per-row placement.

![Unassigned pool, desktop](unassigned-desktop.jpg)

Assign one person from the pool.

![Assign popover, desktop](assign-desktop.jpg)

Bulk placement of selected people.

![Bulk assign, desktop](bulk-desktop.jpg)

## Creating a node

Kind, site, parent of the kind above, head, effective date.

![Create node, desktop](create-desktop.jpg)

## Other states

Loading, error with retry, no units yet, no search results, read-only role, large roster.

![Loading, desktop](loading-desktop.jpg)

![Error, desktop](error-desktop.jpg)

![No units, desktop](no-units-desktop.jpg)

![No results, desktop](no-results-desktop.jpg)

![Read-only, desktop](readonly-desktop.jpg)

![Large roster, desktop](large-desktop.jpg)

## Mobile

Tree, node detail, move, bulk placement, head picker, overview.

![Tree, mobile](list-mobile.jpg)

![Section detail, mobile](section-mobile.jpg)

![Move popover, mobile](move-mobile.jpg)

![Bulk assign, mobile](bulk-mobile.jpg)

![Head picker, mobile](head-mobile.jpg)

![Overview, mobile](overview-mobile.jpg)
