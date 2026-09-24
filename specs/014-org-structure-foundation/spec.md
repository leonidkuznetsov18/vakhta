# Feature Specification: Organisation structure as the system of record

**Change**: 014-org-structure-foundation | **Created**: 2026-09-24 | **Status**: Draft (awaiting
owner answers to the decisions in "Open decisions") | **Baseline**: `b2a0e2f` | **Checkout**:
`claude/practical-bohr-1ihj4g` (session branch; the owner's rule is master)
**Authority**: Owner request 2026-09-24: "Оргструктура підприємства має стати базисом, бо на це
буде підв'язано взагалі все: зарплата, бонуси, лікарняні і все інше", after the proposal in
[unit-management-workspace.md](../../docs/engineering/features/unit-management-workspace.md).
The owner asked for a spec and visual prototypes; the five design questions of 2026-09-24 are
answered here as explicit assumptions until the owner overrides them.
**Product document**: [Admin panel](../../docs/features/11-admin-panel.md) (§ Справочники),
[Schedule](../../docs/features/05-schedule.md), [Bonus](../../docs/features/09-bonus.md); a new
`docs/features/13-org-structure.md` on delivery.
**Engineering memory**: [unit-management-workspace.md](../../docs/engineering/features/unit-management-workspace.md)
(proposal and prototype evidence), [org-structure-tree.md](../../docs/engineering/features/org-structure-tree.md).

## RECON: Current Behavior

Facts from the baseline (file references are exact at `b2a0e2f`).

**Model.** `sites` → `org_units` (`site_id`, `parent_id` self-FK, `name`, `master_employee_id`,
`master_assigned_at/by`; no kind, no dates, no archive flag; `packages/db/src/schema/org.ts:27-46`)
→ `teams` (unit-bound) and `responsibility_zones` (unit-bound workplaces). `positions` are global.
An employee's place is the newest `employee_positions` row whose `valid_from <= now` and
`valid_to` is null or later (`identity.ts:45-64`; `employees.service.ts:735-768`): `org_unit_id`,
`position_id`, `team_id`, `manager_employee_id`, `valid_from`, `valid_to`. A transfer closes the open
row at the new `valid_from` and inserts one (`positions.service.ts:58-114`); `manager_employee_id`
defaults to the unit's designated master (`:85`). `currentPosition: null` is a legal state (cards
created without a position, every CSV import).

**Hierarchy.** `parent_id` changes are not dated (`PATCH /admin/org/units/:id` writes in place and
appends `ORG_UNIT_UPDATED` with the new values). Nothing prevents cycles except `parentId === id`.
`grantCovers` is flat: a grant scoped to a unit covers only that unit, never its children
(`packages/domain/src/access/scope.ts:12-25`, comment "поки пласка").

**Responsibility.** One `master_employee_id` per unit ("Мастер смены" in Directories,
"Ответственный мастер" in the profile). It need not belong to the unit, needs no role, and is not
touched when the employee is terminated or transferred. Panel access is a separate `SHIFT_MASTER`
grant scoped to the unit (`web_user_roles`), matched to the employee only by e-mail in the profile
(`employee-profile.service.ts:249-290`).

**Consumers of "which unit".** Schedule versions are per unit and month; `shift_assignments`
store `org_unit_id`; planning someone whose current unit differs is borrowing
(`schedule.service.ts:569-594`). Bonus awards store `org_unit_id` at earning time
(`bonus.ts:196-197`); month-end awards go to members with an open row in the unit
(`bonus-month.service.ts:139-150`). Several readers select `valid_to IS NULL` without the
`valid_from <= now` check (`plan-context.ts:221`, `bonus.service.ts:1357,1688`,
`bonus-month.service.ts:147`, `shift.service.ts:286,388`, `employees.service.ts:831`), so a
future-dated transfer is visible to them one row earlier than to the profile and the panel.

**Deletion.** `DELETE /admin/org/units/:id` is a hard delete; any FK violation becomes
`DIRECTORY_ROW_IN_USE` (`org.service.ts:219-262`). Closed `employee_positions` rows reference the
unit, so a unit that ever had a person cannot be deleted.

**UI.** Units are the second of five tables in Administration → Справочники, with a tree switch and
a unit Sheet (master + unit shifts). People are placed from the full employee profile only. The
2026-09-24 proposal and prototype (`apps/admin-web/src/features/org-structure/ui/workspace/`)
already render a master/detail workspace with a pinned "no unit" pool, attention states and inline
moves; it is not routed and calls no API.

**Out-of-scope facts.** `AGENTS.md` lists payroll and ERP integration outside the MVP. The owner's
request names payroll and sick leave as future consumers; this spec makes the structure able to
answer their questions (day-precise "who was where, under whom") without building them.

## SPEC: Outcome and Boundaries

The organisation structure becomes the record every other module reads from, with three
properties it lacks today:

1. **Typed hierarchy with history.** Every node has a kind (division → shop → section), a site, a
   parent of the kind above it, and a dated history of its name, parent, kind and responsible
   people. "As of date D" questions have one answer.
2. **Responsibility as explicit roles on a node.** A node has a head (керівник) and up to one
   shift master per shift type (day, night). An employee's manager is the head of their node
   unless overridden. Missing, inactive and transferred responsibles are visible states.
3. **One placement function.** `placementOf(employee, at)` in `packages/domain` is the only way any
   module learns an employee's node, position, team and manager at an instant; every reader that
   selects `valid_to IS NULL` today moves to it.

On top of it, the panel gets a top-level section **Оргструктура** (sidebar, between Сотрудники and
График, as in the owner's reference screenshot): tree with counts on the left, the selected node
on the right (responsibles, people, actions), the pinned pool of people without a node, and
inline moves with an effective date. Administration → Справочники keeps sites, teams, positions
and zones; its units table and tree are removed once the section ships.

Non-goals (this change):

- payroll, sick-leave or absence calculations themselves (they become consumers later);
- a reports-to graph between people (the manager is derived from the node head; an override is a
  field, not a tree);
- org-chart drawing (boxes and lines), drag-and-drop of people or nodes;
- multiple concurrent placements per employee;
- changing how schedules, handover or bonus store their unit (they keep the unit at the time of the
  fact; they only change how they _read_ the current placement);
- moving teams or zones between nodes (they stay bound to their node; a node move carries them).

Assumptions (the owner's five questions, answered with defaults; each is overridable):

- **A1 Fixed kinds.** `OrgUnitKind = DIVISION | SHOP | SECTION` (ru: Подразделение / Цех /
  Участок; uk: Підрозділ / Цех / Дільниця; en: Division / Shop / Section). A DIVISION has no parent,
  a SHOP's parent is a DIVISION, a SECTION's parent is a SHOP. People are placed in any kind.
  Existing units migrate as SHOPs under one generated DIVISION per site named after the site;
  existing sub-units migrate as SECTIONs. Sites stay the physical/time-zone dimension; every node
  carries `site_id` and a child inherits its parent's site.
- **A2 Three responsible slots.** `head` (керівник: approves requests, reads reports, is the
  default manager) on every node, and `shift_masters[DAY|NIGHT]` (accept handover, receive
  escalations, confirm checklists) on shops and sections only — a division works no shifts. A
  section that names no shift master inherits the nearest ancestor's one (shown as "по наследству
  от «Цех»"), the same way scope inheritance works in A4; only a node with no effective shift
  master is in the `NO_SHIFT_MASTER` state. The current `master_employee_id` migrates to
  `shift_masters[DAY]` of the same node; the head is empty until assigned (an attention state). A
  person may hold slots on several nodes. Assigning a slot never grants panel access; the state
  "no panel access" is derived and shown.
- **A3 Effective-dated history, day precision.** Node attributes and responsible slots are
  versioned with `valid_from` (a business date in the site's time zone) and an optional `valid_to`.
  Placement rows keep their existing instant precision. Renames are also dated so that a report for
  August shows August's names.
- **A4 Scope covers the subtree.** A grant scoped to a node covers the node and every descendant
  as of the evaluation instant. SITE and ENTERPRISE grants keep their meaning. TEAM and ZONE grants
  stay exact.
- **A5 Payroll precision.** Consumers may ask "who was in node X on date D, under whom, in which
  position": the structure answers at day precision for nodes and instant precision for people.
  No payroll rules are implemented.
- Only `ADMIN` (enterprise or site scope) changes the structure and responsible slots; `ADMIN`
  and `HR` place people; every other panel role reads the section. A site-scoped ADMIN sees and
  edits the subtree of that site and sees the pool of people without a node only when the pool is
  scoped to that site (people created with a site) — otherwise the pool shows a scope note.
- Archived nodes are hidden from pickers, schedules and the tree by default, listed under an
  "Archived" filter, and keep all history. A node can be archived only when it has no open
  placements, no active children, no unpublished schedule versions and no open shifts.

Open decisions (block only the parts they name; everything else can proceed):

- **D1** Kind names and count (three fixed levels as in the reference, or a fourth "team" level
  above бригади). Blocks the migration script and the kind labels.
- **D2** Whether a full-day shift master slot exists (the shift templates have a Full day type).
  Blocks nothing; the slot enum is extensible.
- **D3** Whether payroll enters the product scope (`AGENTS.md` change). Blocks nothing here.

## User Scenarios and Testing

### US1: The structure answers "who is where, under whom" for any date (Priority: P1)

Any module (schedule, bonus, future payroll or absence) asks the domain, not the tables.

**Acceptance scenarios**:

- **AC-001**: Given an employee transferred from SHOP A to SHOP B with `validFrom` = 2026-10-01
  08:00 Europe/Kyiv, when `placementOf(employee, 2026-09-30T23:00Z)` is asked, then it answers A;
  at `2026-10-01T05:00Z` it answers B; the manager in each answer is that node's head as of the same
  instant unless the placement row overrides it.
- **AC-002**: Given SECTION S moved from SHOP A to SHOP B effective 2026-10-01, when the subtree of
  A is read as of 2026-09-15, then S is in it; as of 2026-10-15 it is under B; S's people keep their
  placement rows untouched (the node moved, not the people).
- **AC-003**: Given a node renamed effective 2026-09-01, when a report for August is rendered, then
  it shows the August name.
- **AC-004**: Given the readers listed in RECON that select `valid_to IS NULL`, when the change is
  delivered, then each of them calls `placementOf` (or its SQL twin `employeePlacementSql(at)`)
  and a test with a future-dated transfer proves that bonus month membership, schedule plan context,
  shift unit fallback and the profile agree on the same node for the same instant.

### US2: Responsible people are explicit, visible and safe to change (Priority: P1)

- **AC-005**: A node shows its head and its day and night shift masters with one of the states
  `ASSIGNED`, `MISSING`, `INACTIVE` (BLOCKED or TERMINATED employee), `ELSEWHERE` (the person's
  placement is in another node and not an ancestor/descendant), `NO_PANEL_ACCESS` (a shift master
  without a `SHIFT_MASTER` grant covering the node). Each state has one hue and one icon; text
  always accompanies colour.
- **AC-006**: Assigning or replacing a slot is one popover from the node detail: people of the node
  first, then everyone active; the change is dated (default today) and audited
  (`org_unit.responsible.set`) with before/after.
- **AC-007**: When an employee holding a slot is terminated or transferred out of the subtree, the
  slot keeps the person but the node enters `INACTIVE` or `ELSEWHERE`; the Overview and the section
  count such nodes as "требуют внимания". No automatic reassignment.
- **AC-008**: Handover escalation and checklist review use the effective shift master of the
  shift type in progress (the node's own, else the nearest ancestor's); when none exists, the
  escalation falls back to the node's head, then to site PRODUCTION_HEAD grants, and the fallback
  used is recorded on the escalation.

### US3: Administrators shape the structure without losing history (Priority: P1)

- **AC-009**: Creating a node asks for kind, name, site (when more than one), parent (of the kind
  above; none for DIVISION), head and shift masters (optional), effective date (default today). A
  SECTION under a DIVISION is rejected (`ORG_UNIT_KIND_MISMATCH`), a parent on another site is
  rejected (`ORG_UNIT_SITE_MISMATCH`), a cycle is rejected (`ORG_UNIT_CYCLE`).
- **AC-010**: Editing name, parent or kind writes a new version with its effective date; the
  previous version closes the day before. The node detail has a "История" section listing versions
  and responsible changes with author and date.
- **AC-011**: "Архивировать" is disabled with the concrete reason while the node has open
  placements, active children, unpublished schedule versions or open shifts; when allowed it asks
  for a reason, closes the node version, hides it from pickers and keeps every reference readable.
  Hard delete stays only for a node with no history at all (never referenced) and remains ADMIN-only
  with a reason.
- **AC-012**: A site-scoped ADMIN cannot create, edit, move or archive nodes outside that site
  (403 `OUT_OF_SCOPE`); today's missing check in `OrgService` is closed.

### US4: People are placed and moved from the structure (Priority: P1)

- **AC-013**: The section shows the pool "Без подразделения" with its count in the summary and as
  the first row of the tree; each person there has "Назначить в…" (node, position, optional team,
  effective date); multi-select gives "Назначить выбранных" with one node, one position, one date
  for all.
- **AC-014**: A person in a node has "Переместить в…": node, position (kept by default), team
  (reset when the target has none, chosen when it has), effective date (default now; a date in the
  past not earlier than the current row's `validFrom`, else `VALID_FROM_BEFORE_CURRENT`). The
  popover states that planned shifts stay in the previous node.
- **AC-015**: Bulk placement is one request (`POST /admin/employees/positions/bulk-assign`), one
  transaction, one audit entry with the list of employees, and a per-employee result; a failed
  employee does not roll back the others only if the owner chooses "partial" mode — default is
  all-or-nothing.
- **AC-016**: Search across people and nodes: picking a person opens their node with the row
  highlighted and scrolled into view; picking a node selects it.

### US5: Access follows the tree (Priority: P1)

- **AC-017**: A `SHIFT_MASTER` grant scoped to SHOP A covers handovers, incidents and checklists of
  every SECTION under A as of the evaluation instant; a grant on a SECTION does not cover its SHOP.
  `canActOn`, `scopeCovers`, `accessScope`, `reviewableUnitIds` and `employeePlaceSql` share one
  subtree resolver; an invariant test proves that no reader answers differently.
- **AC-018**: Moving a node under another parent changes what existing grants cover from the
  effective date; the audit entry of the move lists the grants whose coverage changed.

### US6: Read-only readers get the same picture (Priority: P2)

- **AC-019**: PRODUCTION_HEAD, PLANNER, HR (structure), ACCOUNTANT and AUDITOR open the section
  and see tree, counts, responsibles, people and history without any mutation control; every
  mutation endpoint returns 403 to them.

### Edge Cases

- A person placed in a DIVISION directly (allowed): counts roll up to the division only.
- Two shift masters are the same person: allowed, shown once with both slots.
- The head is also a shift master of the same node: allowed.
- A node archived while it is the target of a future-dated placement: the placement is rejected at
  archive time (`ORG_UNIT_HAS_FUTURE_PLACEMENTS`) — the administrator moves it first.
- A future-dated node version (effective next month) is shown in the tree with a "с 01.10" chip and
  is not yet used by placements or grants.
- The tree at 3 sites × 40 nodes × 500 people: the section reads the snapshot and the roster once
  and computes counts on the client until measurement shows a need for server headcount.
- Offline/paused query: the section keeps the cached tree and marks it stale; mutations are not
  auto-retried.
- Mobile: the tree is the screen; a node opens over it with a back control; popovers fit 390 px.

## Requirements

### Functional Requirements

- **FR-001**: `org_units` gains `kind` (`org_unit_kind` pgEnum), `archived_at`, and a versions
  table `org_unit_versions` (`org_unit_id`, `valid_from` date, `valid_to` date null, `name`,
  `parent_id`, `kind`, `site_id`, `changed_by`, `reason`) with an exclusion constraint against
  overlapping ranges per node and a check that a parent's kind is the kind above. Verified by
  AC-002, AC-003, AC-009, AC-010 and migration tests.
- **FR-002**: `org_unit_responsibles` (`org_unit_id`, `slot` pgEnum `HEAD | SHIFT_MASTER_DAY |
SHIFT_MASTER_NIGHT`, `employee_id`, `valid_from`, `valid_to`, `assigned_by`) replaces
  `master_employee_id` (kept read-only for one release, then dropped). Verified by AC-005–AC-008.
- **FR-003**: `packages/domain` exports `placementOf`, `responsibleOf(node, slot, at)`,
  `subtreeOf(nodes, rootId, at)`, `managerOf(employee, at)`; pure, tested with fast-check for the
  interval invariants. The API adds `employeePlacementSql(at)` with the same semantics for set
  queries. Verified by AC-001, AC-004.
- **FR-004**: `grantCovers` accepts a subtree resolver; ORG_UNIT grants cover descendants as of the
  instant. Verified by AC-017, AC-018 with invariant tests against PostgreSQL.
- **FR-005**: `GET /admin/org` returns nodes with `kind`, `archivedAt`, `responsibles` (with derived
  state and `hasPanelAccess`), `headcount` (direct and subtree), and accepts `?asOf=<date>`;
  `GET /admin/org/units/:id/history` returns versions and responsible changes.
- **FR-006**: `POST/PATCH /admin/org/units` take `kind`, `parentId`, `validFrom`, `reason`;
  `POST /admin/org/units/:id/archive {reason}`; `PUT/DELETE /admin/org/units/:id/responsibles/:slot
{employeeId, validFrom}`; `POST /admin/employees/positions/bulk-assign`. All ADMIN with subtree
  scope checks; placement also HR. Every write appends a domain event and an audit row.
- **FR-007**: The panel section Оргструктура implements US2–US6 on the prototype's slice
  (`features/org-structure`), routed at `#/org-structure/{-$nodeId}`, with `unassigned` as a
  reserved id; deep links from Employees, Overview, Schedule and Handover use
  `useNavigation().go('org-structure', id)`.
- **FR-008**: All new user-facing text lives in the three catalogs; kind, slot and state codes are
  `as const` objects with derived `z.enum` and `pgEnum`.
- **FR-009**: Administration → Справочники drops the units table, tree and unit Sheet's master field
  once the section ships; unit shift templates move to the node detail ("Смены" section). The
  Directories "needs a master" filter is replaced by the section's attention filter.

### Key Entities

- **OrgUnit** (existing, changed meaning): `kind`, `archivedAt`; attributes read through the
  version valid at the instant.
- **OrgUnitVersion** (new): dated name/parent/kind/site.
- **OrgUnitResponsible** (new): dated (node, slot, employee).
- **Placement** (existing `employee_positions`, unchanged shape; `manager_employee_id` becomes an
  explicit override, null meaning "the node head").
- **Grant** (existing `web_user_roles`): unchanged shape; coverage semantics change for ORG_UNIT.

## Success Criteria

- **SC-001**: For any instant, `placementOf`, the profile, the schedule plan context, bonus month
  membership and the shift unit fallback name the same node for the same employee (AC-001,
  AC-004).
- **SC-002**: Every node without a head or with an unusable shift master is listed under "требуют
  внимания" in the section and on the Overview within one refresh of the org query (AC-005,
  AC-007).
- **SC-003**: Placing a new hire, moving a person, and replacing a responsible each take at most
  five interactions from the section root, on desktop and at 390 px (AC-006, AC-013, AC-014).
- **SC-004**: A node with history is never deleted; archived nodes keep every historical report
  readable with their period-correct names (AC-003, AC-011).
- **SC-005**: A grant on a shop covers its sections everywhere access is evaluated; a grant on a
  section never widens (AC-017).

## Verification Scope

Classification under `docs/engineering/testing-baseline.md`: **access + migrations + money
adjacency** (bonus membership) → invariant tests on PostgreSQL (testcontainers) for FR-001, FR-003,
FR-004; focused regressions for every reader migrated to `placementOf`; contract tests for
FR-005/FR-006; domain property tests for interval logic; panel unit tests for the workspace model
and the section's states; Playwright captures of the changed surfaces (section desktop/mobile,
Directories after the removal, Overview attention count); one independent review of the access
and migration steps. Live QA on `dev@vakhta.xyz` only for the section and Directories journeys.
Results are recorded in the engineering memory; `plan.md` names the exact commands.

## Prototype (visual reference for this spec)

Rendered from fixtures on the panel's components (`apps/admin-web/e2e/units.html?state=<key>`,
`apps/admin-web/src/features/org-structure/ui/workspace/`); captures in
`docs/engineering/evidence/org-structure-2026-09-24/` and the shared page linked from the
engineering memory. The states it demonstrates map to: tree and counts (US1 picture, AC-013),
responsibles with states (AC-005–AC-007), move with effective date (AC-014), bulk placement
(AC-015), node creation with kind (AC-009), history (AC-010), archive blocked (AC-011), read-only
(AC-019), mobile (Edge Cases).
