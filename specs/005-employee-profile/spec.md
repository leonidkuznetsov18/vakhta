# Feature Specification: Employee profile

**Change**: 005-employee-profile | **Created**: 2026-09-13 | **Status**: Implementation authorized — in progress
**Baseline**: 64560d7 | **Checkout**: master | **Authority**: Owner request 2026-09-13: an employee profile with full name, avatar, rate, birthday, phone, Telegram, e-mail, salary, marital status, schedule, position, unit, zone and master; describe the feature and publish a GitHub epic with issues. Owner decisions recorded below. Implementation authorized by the owner on 2026-09-13 in the epic implementation task.
**Product document**: [admin panel](../../docs/features/11-admin-panel.md) (Employees section)
**Engineering memory**: [Employee profile](../../docs/engineering/features/employee-profile.md)

## RECON: Current Behavior

**Actors.** HR (`HR`) and administrators (`ADMIN`) maintain employee cards. Shift masters
(`SHIFT_MASTER`), planners (`PLANNER`) and the production head (`PRODUCTION_HEAD`) read them.
Accountants (`ACCOUNTANT`) have no employee view today. Workers use the Telegram bot and have no
profile screen.

**Implementation facts.**

| Area          | Current behavior                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Employee card | `employees` stores personnel number, full name, status, locale and optional e-mail, phone (E.164) and Telegram username. The panel shows a two-column card expanded under a list row with an "edit data" form; there is no employee page.                                                                                    | `packages/db/src/schema/identity.ts`, `apps/admin-web/src/admin/EmployeesTab.tsx`                                 |
| Birth date    | Being added by a concurrent, uncommitted calendar/birthday change: column, contracts and migration `0049_calendar_events.sql`; not yet written by the service or shown in the panel.                                                                                                                                         | `identity.ts`, `packages/contracts/src/identity.ts`, `packages/db/drizzle/0049_calendar_events.sql`               |
| Assignment    | `employee_positions` is a versioned assignment (unit, team, position, `managerEmployeeId`, valid from/to). A transfer creates a new row. `managerEmployeeId` is validated on write but read nowhere else.                                                                                                                    | `identity.ts:39-58`, `apps/api/src/identity/positions.service.ts:37-71`                                           |
| Master        | A master is a panel user with a `SHIFT_MASTER` grant on a unit. The only employee link is an e-mail match used by bonus nominations. A unit has no designated master, so "who is this employee's master" has no answer.                                                                                                      | `apps/api/src/bonus/bonus-month-nominations.ts:76-91`                                                             |
| Zone          | No employee-to-zone link. Zones are per unit (`responsibility_zones`); a person's zone exists only on individual scheduled shifts and shift sessions.                                                                                                                                                                        | `packages/db/src/schema/org.ts:67`, `scheduling.ts:114`                                                           |
| Schedule      | No per-employee schedule. Units publish monthly schedule versions of per-person, per-date `shift_assignments` (day/night templates, zone, custom times). Patterns are batch inputs.                                                                                                                                          | `packages/db/src/schema/scheduling.ts:53,93,289`                                                                  |
| Money         | No rate, tariff or salary field exists. The only amounts are the per-period bonus base and result, entered manually.                                                                                                                                                                                                         | `packages/db/src/schema/bonus.ts:168-169`                                                                         |
| Avatar        | Panel users have a 256 px avatar with initials fallback; employees have none. Private object storage and `media_objects` exist for other media.                                                                                                                                                                              | `apps/admin-web/src/components/app/avatar.tsx`, `apps/api/src/infra/object-storage.ts`                            |
| Access        | Employee reads are role-gated (`ADMIN`, `HR`, `PRODUCTION_HEAD`, `PLANNER`, `SHIFT_MASTER`) but **do not apply grant scope**: a unit-scoped master can read every employee. Restricted data has one precedent: medical documents are omitted from normal views and a denied access writes `medical.denied` to the audit log. | `apps/api/src/identity/admin-employees.controller.ts:49-113`, `apps/api/src/requests/requests.service.ts:599-612` |
| Audit         | Employee edits record `employee.update` with before/after of changed fields in the same transaction; the editable field list is hard-coded.                                                                                                                                                                                  | `apps/api/src/identity/employees.service.ts:137-162`, `apps/api/src/events/audit-log.ts:21`                       |

**Observed problems.**

- P1. People data needed by HR, masters and accounting is scattered or missing: no avatar, zone,
  master, marital status, rate or salary; the schedule lives only in the unit calendar.
- P2. The master relationship is implicit and unreliable (grant + e-mail match); nobody can see an
  employee's master or which units have none.
- P3. The expandable row card cannot hold a growing, sectioned profile with restricted parts.
- P4. **Access boundary.** Employee reads ignore grant scope. Adding personal and compensation data
  to an unscoped read would widen an existing exposure. This is a prerequisite.

## SPEC: Outcome and Boundaries

**Outcome.** Every employee has one profile in the admin panel that answers: who is this person and
how to reach them, where they work (position, unit, team, zone from the schedule) and who their master is, when
they work (published schedule), and — only for permitted roles — their employment rate, tariff,
salary and marital status. HR uses one Edit action on the profile, with validation and audit.

**Target composition** (desktop two columns; mobile one column in the same order):

```text
┌ Header ─────────────────────────────────────────────────────────────────┐
│ (avatar) Ivanenko Olena Petrivna   №01234   ● ACTIVE   Telegram linked   │
│ Machine operator · Unit Lathe · Zone Lathe 2 (shift) · Master: V. Petrenko│
├ Contacts ───────────────────────┬ Work ─────────────────────────────────┤
│ Phone +380 67 123 45 67  (copy) │ Position, unit, team, zone from shift │
│ Telegram @olena_i        (open) │ Master (derived from unit) + state    │
│ E-mail o.ivanenko@…      (mail) │ Assignment history                    │
├ Personal ───────────────────────┼ Schedule ─────────────────────────────┤
│ Birth date 14.03.1990           │ This month: 15 shifts · 180 h planned │
│ Marital status  [HR/ADMIN only] │ Next shifts: 14.09 DAY Lathe 2 …      │
│                                 │ Open in Schedule →                    │
├ Compensation [ADMIN/HR/ACCOUNTANT only] ────────────────────────────────┤
│ Current from 01.09.2026: rate 1.00 · tariff 95.00 UAH/h · salary —      │
│ History: 01.03.2026 rate 0.75 · … (corrected entries marked)            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Owner decisions (2026-09-13).**

- D-01 "Rate" covers two values: the employment rate (FTE fraction, e.g. 1.0, 0.5) and an hourly
  tariff. Salary is a separate monthly amount. An employee may have a tariff, a salary or both.
- D-02 Compensation (rate, tariff, salary) is visible to `ADMIN`, `HR` and `ACCOUNTANT`; marital
  status only to `ADMIN` and `HR`. Masters, planners and the production head see contacts, work
  assignment and schedule. Denied access to restricted data is audited, as for medical documents.
- D-03 Compensation is stored as dated versions ("effective from"); history is kept and a past
  month reads the value effective then.
- D-04 Every unit has a designated master. An employee's master is derived from the unit of their
  current assignment and must be clearly visible; a missing master is visible, not silent.

**Scope.**

1. Grant scope on all employee reads (list, card, profile, schedule summary, avatar) — prerequisite.
2. A dedicated profile view reachable from the employee list and from any employee mention that
   already links to Employees.
3. Section editing for full name, avatar, birth date, phone, Telegram username, e-mail and marital
   status by `ADMIN`/`HR`, reusing existing contact validation.
4. A designated master per unit (set by `ADMIN`) and the derived master on the profile with explicit
   missing/inactive states. The zone is derived from the schedule, not stored (D-05).
5. A restricted, versioned compensation section.
6. A read-only schedule summary built from published schedule assignments.

**Non-goals.** Payroll, wage or tax calculation, timesheet pricing, exports of compensation, and
any change to bonus computation (payroll stays out of MVP scope; compensation is recorded reference
data only). A worker-facing profile in the Telegram bot. Per-shift (day/night) masters. Editing the
schedule from the profile. Employee document storage or qualifications (tracked in #48/#49). Telegram
profile photo import. Changing how panel users and grants are managed.

**Compatibility.** Existing employees start with no avatar, marital status or
compensation; the profile renders these as "not specified". Existing units start without a master
and are listed as needing one. The unused `managerEmployeeId` is not shown and not written by new UI
(see Open Decisions in plan). CSV import and activation codes keep their current behavior. The
concurrent birth-date change owns the birth-date column and greeting; this change only displays and
edits it.

**Design decision after Lean review (2026-09-13).**

- D-05 The zone is not a new stored attribute. A person's zone already lives on each scheduled shift;
  a second "home zone" would drift from it. The profile shows the zone of the current shift, else of
  the next published shift, plus the distinct zones planned this month. The owner may override this
  with a stored home zone on the versioned assignment.

**Assumptions.**

- A1 One responsible master per unit; nested units do not inherit a parent's master.
- A2 The master is an employee (so they have a profile); a master without a panel `SHIFT_MASTER`
  grant covering the unit is shown with a warning, not rejected.
- A3 Employment rate is 0.01–1.00 with two decimals; tariff and salary are non-negative amounts in
  UAH with two decimals. Other currencies are out of scope.
- A4 Marital status codes: `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED`; empty means not specified.
  Labels are gender-neutral in all three languages.
- A5 Roles who may read an employee but not the full birth date (masters, planners, production
  head) see day and month only, which is enough for greetings.
- A6 An employee without a current assignment is visible only to enterprise-scoped users.

## User Scenarios and Testing

### US1: Scoped and field-restricted employee data (Priority: P1)

A unit-scoped master or planner sees only employees of their scope, and restricted values never
leave the server for roles without access. Prerequisite for every other story.

**Acceptance scenarios**:

- **AC-001**: Given two units and a master scoped to unit A, when the master lists employees or opens
  a unit B employee by identifier (card, profile, schedule summary, avatar), then the list contains
  only unit A employees and direct reads return 403.
- **AC-002**: Given an employee with compensation and marital status, when `SHIFT_MASTER`, `PLANNER`
  or `PRODUCTION_HEAD` requests the profile, then the response contains no compensation, no marital
  status and only day/month of birth; `ACCOUNTANT` receives compensation but not marital status;
  `HR`/`ADMIN` receive everything.
- **AC-003**: Given a role without compensation access, when it calls the compensation read or write
  directly, then it receives 403 and an `employee.compensation.denied` audit entry is recorded.
- **AC-004**: Given a restricted field changed, when a role without access to that field reads the
  audit log, then the entry does not reveal the restricted values.

### US2: Employee profile view (Priority: P1)

HR or a master opens one profile and sees identity, avatar, contacts, work assignment and master
without opening other pages.

**Acceptance scenarios**:

- **AC-005**: Given the employee list, when a user clicks a row, a read-only Sheet opens without a disclosure chevron.
  The employee name and the Sheet deep-link button open the profile on its own shareable address.
  Browser back returns to the list with filters, page and scroll kept (owner refinement, 2026-09-13).
- **AC-006**: Given a profile, then the header shows avatar (or initials), full name, personnel number,
  status, Telegram link state, position, unit, zone (D-05) and master; contacts offer copy, `tel:`,
  `mailto:` and Telegram link actions.
- **AC-007**: Given missing optional data, then each empty field shows "not specified" in the section
  (with an edit affordance for editors), never a blank or a zero.
- **AC-008**: Given the profile request is loading, refreshing, offline or failed, then the page shows
  the shared loader, cached data with refresh feedback, or a retry — never an empty profile.
- **AC-009**: Given a `TERMINATED` employee, then the profile is read-only except the existing status
  action, and history is preserved.
- **AC-010**: Given a 390 px viewport, then sections stack in one column, long names and e-mails wrap,
  and the document is not wider than the viewport.

### US3: Edit personal data, contacts and avatar (Priority: P1)

HR opens one editor on the profile for identity, contacts and personal fields. Avatar and work assignment controls are available in that editing context; compensation keeps its dated add/correct workflow.

**Acceptance scenarios**:

- **AC-011**: Given `HR`, when they edit full name, birth date, phone, Telegram username, e-mail or
  marital status in the unified profile editor, then invalid input shows inline errors (existing phone and
  username normalization; birth date not in the future and at least 14 years ago) and save stays
  disabled until the draft differs from the saved values.
- **AC-012**: Given a valid save, then one audit entry records before/after of changed fields (subject
  to AC-004) and every open view of that employee updates.
- **AC-013**: Given two editors change the same employee, when the second saves a stale draft, then
  the save is rejected as a conflict, the draft is kept and the current values are shown.
- **AC-014**: Given `HR` uploads a JPEG, PNG or WebP photo up to 10 MB, then it is stored privately,
  shown as a square avatar in the profile and employee list, and replaces the previous one; removing
  it restores initials. Other types or larger files are rejected with a localized reason.
- **AC-015**: Given an upload fails, then the previous avatar stays, the error is shown with retry, and
  no partial avatar is visible.
- **AC-016**: Given `SHIFT_MASTER`, `PLANNER` or `PRODUCTION_HEAD`, then no edit affordance appears and
  a direct write returns 403.

### US4: Unit master and zone (Priority: P1)

Every unit has a visible responsible master, and every assigned employee shows their master and zone.

**Acceptance scenarios**:

- **AC-017**: Given `ADMIN` on the unit directory, when they designate an active employee as the unit's
  master, then it is saved with audit, and every profile whose current assignment is in that unit shows
  that master with a link to the master's profile.
- **AC-018**: Given a unit without a master, then its employees' profiles show "master not assigned" as
  a warning with text and icon, and the unit directory lists units needing a master.
- **AC-019**: Given the designated master becomes `BLOCKED` or `TERMINATED`, or lacks a `SHIFT_MASTER`
  grant covering the unit, then profiles show the master with an explicit warning state.
- **AC-020**: Given an employee on shift, then the profile zone is the current shift's zone; given no
  open shift, it is the next published shift's zone; the distinct zones planned this month are listed;
  with neither, the zone is "not scheduled".
- **AC-021**: Given the master's own profile, then it shows "master of unit X" and, as their own
  master, the designated master of their assignment's unit (which may be themselves, shown as such).

### US5: Compensation history (Priority: P2)

HR records employment rate, tariff and salary with an effective date; accounting reads them.

**Acceptance scenarios**:

- **AC-022**: Given `HR`, when they add an entry with effective date, employment rate and at least one
  of tariff or salary, then it is saved; the section shows the value effective today and the history
  newest first; a future-dated entry is shown as scheduled.
- **AC-023**: Given invalid input (rate outside 0.01–1.00, negative or more than two decimals, neither
  tariff nor salary), then inline errors are shown and nothing is saved.
- **AC-024**: Given a wrong entry, when `HR` records a correction for the same effective date with a
  mandatory reason, then the correction becomes effective for that date and the original stays in
  history marked as corrected; stored entries are never updated or deleted.
- **AC-025**: Given a past date, then the effective compensation is the latest entry with effective
  date on or before that date, correction applied.
- **AC-026**: Given `ACCOUNTANT`, then the section is visible read-only; given other non-HR roles, the
  section is absent (not a disabled form).

### US6: Schedule summary (Priority: P2)

A master or HR sees when the employee works without switching to the unit calendar.

**Acceptance scenarios**:

- **AC-027**: Given a published schedule, then the profile shows for the current month the planned
  shift count and planned hours, and the next upcoming shifts with date, day/night template, times and
  zone, in the site time zone.
- **AC-028**: Given no published schedule for the month, then the section says so explicitly and links
  to Schedule; unpublished drafts are not presented as the employee's schedule.
- **AC-029**: Given "Open in Schedule", then Schedule opens on that unit and month with the employee
  highlighted. Schedule employee identities show an avatar (initials when absent) and a keyboard-accessible profile link in week/day and month views. Returning from a profile retains the calendar period, date, unit and grouping (owner refinement, 2026-09-13).

### Edge Cases

- Employee without a current assignment: work section shows "not assigned"; master is not specified; visible only per A6.
- Assignment in a nested unit: the master is that unit's master only (A1).
- A scheduled shift's zone was later removed from the directory: the profile shows the recorded zone
  as unavailable rather than failing.
- Transfer between units: the new assignment's unit determines the master from its valid-from time;
  the previous master remains visible in assignment history.
- Two compensation entries for the same date: the later correction wins; history shows both.
- 29 February birth date: day/month display and validation accept it.
- Very long full names, e-mails and Telegram usernames wrap within bounded width.
- Photo EXIF orientation is applied, and location metadata is not kept.
- Telegram username present but no linked Telegram account, and vice versa: both states are shown
  distinctly.
- Concurrent birth-date change not yet delivered: birth-date display/edit ships with whichever
  change lands second, without duplicating the column or migration.
- Bot and kiosk are unaffected; not applicable to this change.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST apply grant scope to every employee read, including list, card, profile,
  schedule summary and avatar, verified by AC-001.
- **FR-002**: The system MUST omit restricted values from responses for roles without access per D-02
  and A5, and audit denied restricted access, verified by AC-002–AC-004.
- **FR-003**: The panel MUST provide an addressable employee profile with header, contacts, personal,
  work, schedule and (when permitted) compensation sections and all async states, verified by AC-005–AC-010.
- **FR-004**: `ADMIN`/`HR` MUST be able to edit full name, birth date, phone, Telegram username, e-mail
  and marital status with runtime validation, audit and conflict detection, verified by AC-011–AC-013, AC-016.
- **FR-005**: `ADMIN`/`HR` MUST be able to upload, replace and remove an employee avatar stored in
  private storage, verified by AC-014, AC-015.
- **FR-006**: The system MUST store at most one designated master per unit, set by `ADMIN` with audit,
  and derive each employee's master from their current assignment's unit with assigned, missing and
  warning states, verified by AC-017–AC-019, AC-021.
- **FR-007**: The profile MUST derive the employee's zone from the open shift or published schedule,
  without storing a separate zone, verified by AC-020.
- **FR-008**: The system MUST store compensation as append-only dated entries (employment rate, tariff,
  salary, currency, optional reason; reason required for a correction), enforce value ranges in the
  database, and resolve the effective entry for any date, verified by AC-022–AC-026.
- **FR-009**: The profile MUST show a read-only schedule summary from published assignments only,
  verified by AC-027–AC-029.
- **FR-010**: Every user-facing string and tooltip MUST exist in `uk`, `en` and `ru`, and restricted
  values MUST never be logged, verified by review and i18n catalog checks.

### Key Entities

- **Employee** (existing `employees`): adds avatar reference and marital status; birth date comes from
  the concurrent change.
- **Unit master** (new): the designated master employee of an org unit.
- **Compensation entry** (new): employee, effective date, employment rate, hourly tariff, monthly
  salary, currency, reason, corrected entry, author and time. Append-only.
- **Employee avatar** (new use of existing private media): normalized square image of an employee.

## Success Criteria

- **SC-001**: In a moderated check on synthetic data, HR finds all 14 requested attributes of an
  employee from one profile address without visiting another page (AC-005–AC-007, AC-022, AC-027).
- **SC-002**: The automated role × section matrix shows zero restricted values or out-of-scope
  employees in responses for every role and scope (AC-001–AC-004).
- **SC-003**: Every active unit either shows its master on its employees' profiles or appears in the
  "needs a master" list; no employee profile shows a blank master (AC-017–AC-019).
- **SC-004**: A master reaches an employee's master and their next shift from the employee list in one
  navigation (AC-005, AC-006, AC-027).

## Verification Scope

High risk under `docs/engineering/testing-baseline.md`: authorization (scope and field restriction),
money-like reference data, a migration with new SQL invariants, and private media. Required: pure
domain tests (with fast-check for effective compensation resolution), PostgreSQL integration tests
for scope, the role × section matrix, append-only compensation and unit-master constraints, component
tests for section visibility and save availability, and one independent access review. Visual QA on
desktop and mobile for the profile, section editors, unit master directory and employee list. Bot and
kiosk need no QA. Exact checks: [plan.md](plan.md).
