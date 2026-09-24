# Feature: units workspace (Administration → Подразделения)

Status: proposal with prototype, 2026-09-24. Owner: frontend + product. Baseline: `6cb467e`.
Authorized scope: the owner's brief "rethink Subdivision / Department Management" (this document
answers its ten deliverables). Nothing here is deployed; the prototype renders from fixtures.

Evidence: `docs/engineering/evidence/org-structure-2026-09-24/` (desktop 1440 px and iPhone 13
captures of every state, produced by `apps/admin-web/e2e/units.spec.ts` against
`/e2e/units.html?state=<key>`). The first iteration's captures (an Administration tab without
node kinds or responsible slots) were replaced by the second; git history keeps them.

## Update 2026-09-24 (evening): the structure as the system of record

The owner reframed the request: the organisation structure will carry payroll, bonus, sick leave
and everything else. The bounded change is now [spec 014](../../../specs/014-org-structure-foundation/spec.md);
this document keeps the proposal history and the prototype evidence. What changed in the
prototype for that spec:

- a top-level section **Оргструктура** in the sidebar instead of an Administration tab;
- typed nodes (Подразделение → Цех → Участок) with collapsible tree, site headings and subtree
  headcount (`model/org-node.ts`, `visibleUnits`);
- three responsible slots per node (руководитель, мастер дневной/ночной смены) with states
  `MISSING / ASSIGNED / INACTIVE / ELSEWHERE`, shift masters inherited from the nearest ancestor,
  no shift-master rows on a division;
- the people table gains «Руководитель» (the node head unless the placement overrides it);
- moves and placements carry an effective date; the node form asks for kind, parent of the kind
  above, head and effective date;
- history section per node; archive in the node menu, disabled with the reason while the node has
  people or children; archived nodes are hidden from the tree.

Verification of the second iteration: admin-web `tsc --noEmit` clean; `eslint
src/features/org-structure` clean with no suppressions; Prettier applied; Playwright 46/46
(23 states × desktop and mobile) with the preinstalled Chromium; every capture inspected.

## 1. Current UX problems

Where units live today: Administration → Справочники → section "Подразделения"
(`apps/admin-web/src/admin/DirectoriesTab.tsx:340-478`), a flat `DataTable` (name, site, parent,
master, shifts) with a table/tree switch (`features/org-structure`), a "needs a master" checkbox and
the unit Sheet (`features/unit-settings`) for the master and the unit's shifts. People are placed from
the other side only: Employees → row → full profile → edit → `AssignPositionForm`
(`admin/EmployeesTab.tsx:822-974`).

| #   | Problem                                                                                                                     | Frequency | Severity | Effort / risk                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------- |
| P1  | Nobody can see how many people have no unit. `currentPosition: null` is invisible everywhere except one muted cell per row. | daily     | high     | Unplaced people are missing from the schedule, cannot check in and earn no bonus.     |
| P2  | Moving a person takes 5 interactions across two tabs and a full-page profile; no bulk move exists.                          | weekly    | high     | Each move is a three-select form; reorganisations of 10+ people are done one by one.  |
| P3  | The master is a column and a Sheet field. Missing, inactive and "works elsewhere" masters look the same as healthy ones.    | weekly    | high     | A unit without a reachable master silently loses handover acceptance and escalations. |
| P4  | Headcount exists only in the tree view, which is opt-in and a second click away.                                            | daily     | medium   | The default table answers none of the owner's nine questions.                         |
| P5  | Units share a page with sites, teams, positions and zones: five tables, five "Add" dialogs, no summary.                     | daily     | medium   | The page is a directory, not a workspace; it does not scale past ~10 units visually.  |
| P6  | Inspecting a unit means opening a Sheet that shows the master and shifts but not the people.                                | weekly    | medium   | Composition is only in the tree; the tree has no actions except "Open".               |
| P7  | Configuration health is not expressed: no state for "no employees", "no master", "master terminated", "master moved".       | monthly   | medium   | Problems surface on the shop floor (an unanswered handover) instead of in the panel.  |
| P8  | Deleting a unit is a hard delete blocked by any FK, including closed position history; the UI cannot say why.               | rare      | low      | The administrator sees a generic "in use" message with no way forward.                |

## 2. Users and jobs to be done

Primary user: the ADMIN (enterprise or site scope) who sets up and maintains the structure; HR
shares the placement job (both roles may `POST /admin/employees/:id/positions`). Secondary readers:
production head and planners, who need the picture but not the actions (read-only mode).

Validated against the product (`docs/product-vision.md`, `docs/features/11-admin-panel.md`):

1. When I open Administration, I want to see how the workforce is distributed by unit and site, so
   that I trust the schedule and bonus are built on the right groups.
2. When cards were imported or created without a position, I want to see them immediately and place
   them in one action each, or all at once, because until then they are outside every workflow.
3. When the organisation changes, I want to move people between units with the position kept, in
   two clicks, and be told what does not travel (the team, the planned shifts).
4. When I look at a unit, I want to know who works there and who answers for it, without opening a
   second screen.
5. When a master is missing, blocked, terminated or moved, I want the panel to say so before the
   next handover fails, and let me fix it in place.
6. When I create a unit, I want to name the master at the same time, so the unit is never in the
   "no master" state by accident.
7. (Read-only roles) When I plan or review, I want the same picture without the controls.

Not a job: dashboards of counts that lead to no action, drag-and-drop for its own sake, a second copy
of the employee directory.

## 3. Competitive patterns

| Product                                                                                                                                                                                                                   | Pattern                                                                                                                                        | Adopt / avoid                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Deputy — Areas](https://help.deputy.com/hc/en-au/articles/5832768874127-Areas-in-Deputy), [bulk actions](https://help.deputy.com/hc/en-au/articles/6072679975055-Changing-a-Team-member-s-main-or-primary-work-location) | Location → Areas; people are assigned from the People list by selecting rows and choosing "Add Location" in a bulk menu; CSV for mass changes. | **Adopt** selection + one bulk action on the people list. **Avoid** CSV as the primary path for a 200-person plant.                                                                      |
| [Connecteam — Smart Groups](https://help.connecteam.com/en/articles/6114686-smart-groups-and-segments)                                                                                                                    | Membership is a rule over user fields; admins of a group are chosen per group; bulk field updates move people implicitly.                      | **Adopt** "one responsible admin per group" as a visible attribute. **Avoid** rule-based membership: unit membership in Vakhta is a dated position row, an explicit fact.                |
| [Personio — Org chart](https://support.personio.de/hc/en-us/articles/29762795544989-Manage-the-Org-chart), [departments](https://support.personio.de/hc/en-us/articles/18862110441885-Set-up-departments-and-teams)       | Chart arranged by department or team; the department card opens an editor with a lead; a lead need not belong to the department.               | **Adopt** the lead as a first-class card field and the "lead may be elsewhere" fact, surfaced as a warning here. **Avoid** the chart as the working surface: it shows, it does not edit. |
| [BambooHR — Directory and org chart](https://help.bamboohr.com/s/article/587751)                                                                                                                                          | Directory grouped by department/division/location; org chart is a view of manager links; search across name, department, location.             | **Adopt** one search across people and units. **Avoid** manager-link trees: Vakhta has no reports-to graph, only unit → designated master.                                               |
| [HiBob](https://www.stitchflow.com/user-management/hibob/manual)                                                                                                                                                          | Terminating a manager leaves reports "unassigned" until re-pointed manually.                                                                   | **Adopt** the lesson: a terminated master must become a visible state, not a silent null.                                                                                                |
| [Zoho Directory — departments](https://help.zoho.com/portal/en/kb/directory/admin-guide/groups/articles/add-department)                                                                                                   | A user is a member of one department; a head may head several.                                                                                 | Matches our model (one open position; one master per unit, an employee may master several units). Nothing to change.                                                                     |

Common to all of them and adopted: an explicit "unassigned" pool as the entry point for new hires; a
master/detail split where the list carries counts and the detail carries the actions; bulk actions
on a selection rather than drag-and-drop (none of the HR products drag people between departments;
drag is used in org charts for reporting lines, which we do not have).

## 4. Analysis of the supplied screenshots

The two "Оргструктура" screens (Miller columns and card grid) were used as ideas only.

- Works: the breadcrumb plus columns model "site › unit › sub-unit › people" without a modal; the
  summary line "1 200 сотрудников · 4 подразделения" answers Q1/Q2 at a glance; cards show
  headcount and leader on one line; the selected person gets a footer with a link to the card.
- Does not transfer: four columns need a 1280 px screen and collapse badly on a phone; there is no
  "unassigned" state at all; the leader is text only, with no missing/inactive state; the card grid
  repeats the same table lower on the page (two representations of one fact); neither view has an
  action beyond navigation, so moving a person still needs another screen.
- Adapted: the two-level "list with counts → detail with people" split, the summary line turned
  into actionable counts, the leader shown as a person (avatar, state) with its action beside it.

## 5. Alternative concepts

| Concept                                                                                                                                                                                                 | Benefits                                                                                                                                     | Drawbacks                                                                                                               | 20 people / 5 units | 200+ people / 15 units                                                 | Complexity                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| **A. Unit cards** — a grid of rich cards (name, count, master, avatar stack, warnings, menu) and an "unassigned" strip on top.                                                                          | Best glance value at small scale; matches the second screenshot; composition visible via avatars.                                            | People are only a stack; every action opens a Sheet; 15 cards × 5 rows push the pool off screen; no per-person actions. | Good                | Poor: cards stop being a picture and become a paginated list of boxes. | Low (reuses Section, AvatarStack, UnitSheet) |
| **B. Master/detail workspace** — left: pinned "Без подразделения" + units with count, master and attention flag; right: the selected unit with master block, people table, per-row and bulk "Move to…". | One screen answers Q1–Q9; every action is inline; the table is already paginated, sortable, selectable; the list stays readable at 50 units. | Two panes need a stacked mobile flow; less "picture" than cards.                                                        | Good                | Good: list scrolls, detail paginates, search jumps to a person.        | Medium (new slice UI, all primitives exist)  |
| **C. Assignment board** — units as columns, people as cards, drag-and-drop between columns, unassigned as the first column.                                                                             | Fastest single move; visual.                                                                                                                 | 60-card columns, horizontal scroll at 8+ units, touch and keyboard DnD, no room for master state, hard to audit a drop. | Very good           | Fails: a column of 117 cards is a list with worse affordances.         | High (DnD lib, a11y, undo)                   |
| **D. Keep Directories, add columns** — headcount column, master state pill, "Move" in the employee table.                                                                                               | Cheapest.                                                                                                                                    | Still five tables on one page; still no pool; still two tabs for one job.                                               | Fair                | Poor                                                                   | Very low                                     |

Recommended: **B**, with the useful parts of A folded in (the summary counts are cards' "glance"
value; the master is a person, not a string) and C rejected until a demonstrated need for drag.
Reasoning: the owner's nine questions are answered by counts and states in the list (Q1, Q2, Q4, Q5,
Q8, Q9) and by the detail (Q3, Q6, Q7); every action is at most two clicks from the row it concerns;
the shared `DataTable` already gives pagination, sorting, search, selection and mobile cards, so the
design scales with the roster without new infrastructure.

## 6. Information architecture

Route: `#/administration/units/<unitId | unassigned>` as a new Administration tab
"Подразделения" (between "Пользователи и роли" and "Справочники"). Directories keeps sites, teams,
positions and zones; its units section becomes a link to the tab. Selection is URL detail, so a link
to a unit is a link to the unit (owner rule 2026-09-14).

```
Administration › Подразделения
├─ Summary: Подразделений N · Сотрудников N · [Без подразделения N] · [Требуют внимания N]   [+ Подразделение]
├─ Toolbar: Площадка (when > 1) · Все | Требуют внимания · Search "Сотрудник или подразделение"
├─ Left pane (≈300 px)                      ├─ Right pane
│  ├─ People hits for the query             │  ├─ Header: name · site › parent · count · teams · zones · [Изменить] [⋮]
│  ├─ ★ Без подразделения          [N]      │  │           nested units as chips
│  ├─ Site heading (when > 1 site)          │  ├─ Master block: avatar, name, state pill · [Назначить/Заменить] [Убрать]
│  │   ├─ Unit  ⚠   master line   N чел. ›  │  │             warning/danger Alert for MISSING / INACTIVE / ELSEWHERE
│  │   └─   Sub-unit (indented)              │  └─ People table: name+number, position, team; row "Переместить в…";
│  └─ Count line                            │      multi-select → "Переместить выбранных"; search; 20 per page
└─ Unit form dialog (create / edit): name, site, parent, master
```

Attention rules, all derived from `GET /admin/org` + the roster, no new read:
`NO_MASTER`, `MASTER_INACTIVE` (BLOCKED/TERMINATED), `MASTER_ELSEWHERE` (master's current position
is in another unit), `NO_EMPLOYEES`. One hue per meaning: orange = wants attention, red = the master
is unusable, neutral = informational. Every colour is paired with an icon and text.

Mobile (< 768 px): the list is the screen; tapping a unit replaces the address with the detail and
shows "← Подразделения"; the table becomes the shared card list; the selection bar and popovers keep
working (verified in `bulk-mobile.jpg`, `move-mobile.jpg`, `master-mobile.jpg`).

## 7. Prototype

Code: `apps/admin-web/src/features/org-structure/` — `model/workspace.ts` (pure view model:
`buildWorkspace`, `searchPeople`, `searchUnits`, `MasterState`, `UnitAttention`),
`ui/workspace/*` (`UnitsWorkspace`, `UnitList`, `UnitDetail`, `UnassignedDetail`, `MasterBlock`,
`PeopleTable`, `MovePopover`, `UnitFormDialog`, `workspace-chrome`), `ui/workspace.fixture.tsx`
(dev-only entry, `?state=` scenarios), `ui/workspace/fixture-data.ts`. Entry page
`apps/admin-web/e2e/units.html`; captures `apps/admin-web/e2e/units.spec.ts`.

Prototype boundaries, on purpose: copy lives in `ui/workspace/text.ts` (Russian) instead of the
three catalogs until the direction is accepted; actions mutate fixture state instead of calling the
API; "Профиль", "Изменить", "Смены" and "Удалить" are wired to no-ops; the tab strip is drawn by the
fixture. Everything else is the real component library (`DataTable`, `StatusPill`, `Alert`,
`Popover`+`Command`, `SelectField`, `AddDialog`, `TableSearch`, `StateFilter`, `UserAvatar`,
`LoadingState`, `QueryFeedback`) so the result is what the panel would render.

| State                       | Capture                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| Overview, unit selected     | `overview-desktop.jpg`, `overview-mobile.jpg`                            |
| List only (mobile entry)    | `list-desktop.jpg`, `list-mobile.jpg`                                    |
| Attention filter            | `attention-desktop.jpg`                                                  |
| Unassigned pool             | `unassigned-desktop.jpg`                                                 |
| Assign one (popover step 2) | `assign-desktop.jpg`                                                     |
| Move one                    | `move-desktop.jpg`, `move-mobile.jpg`                                    |
| Bulk assign 4               | `bulk-desktop.jpg`, `bulk-mobile.jpg`                                    |
| Master picker               | `master-desktop.jpg`, `master-mobile.jpg`                                |
| Master terminated / moved   | `master-inactive-desktop.jpg`, `master-elsewhere-desktop.jpg`            |
| Create unit                 | `create-desktop.jpg`                                                     |
| Search: hits / jump / none  | `search-desktop.jpg`, `search-hit-desktop.jpg`, `no-results-desktop.jpg` |
| No units yet                | `no-units-desktop.jpg`                                                   |
| Read-only role              | `readonly-desktop.jpg`                                                   |
| 306 people                  | `large-desktop.jpg`                                                      |
| Loading / error             | `loading-desktop.jpg`, `error-desktop.jpg`                               |

## 8. Key workflows (clicks counted from the tab)

- **Place a new hire**: summary chip "Без подразделения" (1) → row "Назначить в…" (2) → unit (3) →
  position → "Назначить" (4). Bulk: select rows → "Назначить выбранных" → unit → one position for all
  → "Назначить N чел.".
- **Find and move a person**: type a name (1) → hit opens their unit with the row highlighted (2) →
  "Переместить в…" (3) → target unit (4) → "Переместить" (5). Position is kept; the team resets
  when the target has none, or is chosen when it has teams; the popover states that planned shifts
  stay in the old unit (they do: `shift_assignments.org_unit_id` is stored per assignment).
- **Assign or replace the master**: unit → "Назначить мастера" / "Заменить" → pick (people of this
  unit first, then everyone active). "Сделать мастером смены" also exists in a row's menu.
  Assigning never grants panel access; the tooltip says so once.
- **Master terminated or moved**: the list shows "Мастер неактивен" (red pill in the detail) or the
  ⚠ icon with "работает в «Цех Крышки»"; "Заменить" is the action in both cases.
- **Create a unit**: "+ Подразделение" → name, site, parent, optional master → "Добавить"; the new unit
  is selected. "Добавить вложенное" from the ⋮ menu presets site and parent.
- **Delete a unit**: ⋮ → "Удалить" is disabled with the reason while the unit has people or
  sub-units; the fix is to move them first (the same bulk move). See API needs for history.

## 9. Backend / API requirements

Frontend-only (works on today's API): the whole workspace read (`GET /admin/org` +
`GET /admin/employees/page` walked as `profileDirectoryOptions` already does), all four attention
rules, single move (`POST /admin/employees/:id/positions` with the current `positionId`), master
set/clear (`PUT`/`DELETE /admin/org/units/:id/master`), create/edit unit (`POST`/`PATCH
/admin/org/units`), read-only mode from `canActOn(grants, [ADMIN], {siteId, orgUnitId})` for
structure and `[ADMIN, HR]` for placement.

Needs backend work, in priority order:

1. **Bulk placement** — `POST /admin/employees/positions/bulk-assign {employeeIds[], orgUnitId,
positionId, teamId?}`: one transaction, one audit entry, per-row result. Without it the panel
   would fire N sequential single calls with partial-failure reporting (acceptable for the first
   iteration, but a 40-person reorganisation should not be 40 audit rows and 40 round trips).
2. **Unit archive instead of hard delete** — `org_units.archived_at`; archived units hidden from
   pickers and the list, kept for history. Today `DELETE` is blocked by any FK, including closed
   `employee_positions` rows, so a unit that ever had a person can never be removed
   (`apps/api/src/org/org.service.ts:219-262`).
3. **Master panel access in the snapshot** — `designatedMaster.hasPanelAccess` (the profile already
   computes `NO_PANEL_ACCESS`, `apps/api/src/identity/employee-profile.service.ts:249-290`), so the
   workspace can show the fifth attention state without N profile reads.
4. **Server headcount** (optional) — `orgUnits[].headcount` in `GET /admin/org` would let the list
   render before the roster arrives. The client computes it today from the roster the tree already
   loads; measure before adding.
5. **Scope note** — scoped readers do not see unassigned employees (`employeePlaceSql`), so the pool
   is complete only for enterprise-scope users. The UI must say "видно только в области вашего
   доступа" for site-scoped administrators rather than show a false zero.

Data model facts that shaped the design (no change requested): an employee's unit is the newest
open `employee_positions` row; a move closes the previous row and inserts a new one with
`validFrom` = now; `masterEmployeeId` is not required to belong to the unit; nothing changes the
master when that employee is terminated or moved.

## 10. Implementation plan

Each step is one reviewable commit on `master`; the owner's "no PRs" rule applies.

1. **i18n and slice contract** — move `ui/workspace/text.ts` into `@vakhta/i18n` (uk/en/ru) under
   `admin.administration.units.*` and `ui.hints.units*`; keep `features/org-structure` as the owner
   (rename the slice to `org-structure` stays; the tree is one of its views). Add unit tests for
   `model/workspace.ts` (attention rules, ELSEWHERE, sorting, search, totals, terminated exclusion).
2. **Route and tab** — `AdminPage` tab `units` with `{-$detail}` = unit id or `unassigned`;
   `useNavigation().go('administration', 'units/<id>')` from the Employees table's position cell and
   from the Overview page's unit chips. Directories: the units section becomes a link plus the
   existing tree stays until the owner retires it.
3. **Queries and mutations** — `orgQuery` + `profileDirectoryOptions()` feed `buildWorkspace`;
   mutations: `assignPosition` (per person; sequential for bulk with per-row toast until step 5 of
   the API list lands), `setUnitMaster`/`clearUnitMaster` (reuse `features/employee-profile`
   endpoints through an entity-level API so no feature-to-feature import), `createOrgUnit`,
   `updateOrgUnit`. Invalidate `keys.org` and `keys.employees`; loaders per button/row (owner rule
   2026-09-24); no auto-retry on mutations.
4. **Wire the no-ops** — "Профиль" → `EmployeeProfileLink`; "Изменить" → `EditDirectoryDialog`
   (name, parent); "Смены подразделения" → `UnitSheet` (shifts section only); "Удалить" → existing
   confirm-with-reason, disabled with the tooltip while dependencies exist.
5. **Access** — read-only rendering for non-ADMIN readers; HR gets placement actions but not
   structure actions; site-scoped ADMIN gets the scope note on the pool.
6. **Mobile and QA** — reuse `e2e/units.spec.ts` against the real route with the preview harness;
   desktop and 390 px captures of the changed surfaces; update `docs/features/11-admin-panel.md`
   and this memory with the evidence.
7. **Backend follow-ups** (separate commits, backend owner): bulk-assign, archive, `hasPanelAccess`.

Reuse: `DataTable` (selection, pagination, cards), `StatusPill`, `Alert`, `Popover`/`Command`,
`SelectField`, `AddDialog`, `useConfirm`, `TableSearch`, `StateFilter`, `UserAvatar`, `InfoTip`,
`LoadingState`, `QueryFeedback`, `buildOrgTree`. New: `MovePopover`, `MasterBlock`, `UnitList`,
the workspace model. No new dependency.

## Verification of the prototype

2026-09-24, cloud container: `pnpm --filter admin-web exec tsc --noEmit` clean; `eslint
src/features/org-structure` clean (no suppressions added; C8/C9 rules satisfied: enum-like
constants, ≤ 80 lines per function, complexity ≤ 10, no banned hooks); Prettier applied;
`playwright test e2e/units.spec.ts` 38/38 passed on desktop and mobile projects with the
preinstalled Chromium (`/opt/pw-browsers/chromium`, because the pinned Playwright build wants a
newer headless shell that is not installed here). Every capture was inspected visually. Not run:
`pnpm test` for the package (no tests were added for the prototype model yet, see plan step 1),
production build, live panel.

## Remaining work

The plan above. Open decisions for the owner: the label for the designated master in this tab
("Мастер смены" as in the directory column, or "Ответственный мастер" as in the profile); whether
the Directories tree stays after the tab ships; whether the bulk endpoint is required for the first
release or sequential single calls are acceptable.
