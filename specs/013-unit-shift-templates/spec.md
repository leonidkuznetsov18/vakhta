# Feature Specification: Unit shift templates

**Change**: 013-unit-shift-templates | **Created**: 2026-09-23 | **Status**: Accepted
**Baseline**: 0b0f78cc | **Checkout**: master
**Authority**: Owner request 2026-09-23. Units in Administration → Directories open a unit Sheet that
holds master assignment and custom unit shifts. The Schedule offers each unit its own shifts. The
owner answered these questions on 2026-09-23:

- The picker offers the shifts of the schedule's unit.
- The defaults are always available.
- A unit does not inherit its parent's shifts.
- The shift types are Day, Night and Full day.
- Only an administrator creates, edits and deletes unit shifts. Masters cannot.
- Deleting a shift removes it from the picker but keeps what is already planned.
- Editing a shift changes new assignments only, as in When I Work. This supersedes the earlier
  "propagate to future shifts" answer.
- Take what works at the competitors and invent nothing. See Competitor reference and the
  prototype (`?prototype=unit-shifts` in the panel preview).

**Product document**: [Schedule](../../docs/features/05-schedule.md), [Admin panel](../../docs/features/11-admin-panel.md)
**Engineering memory**: new `docs/engineering/features/unit-shift-templates.md`. Related:
[org structure tree](../../docs/engineering/features/org-structure-tree.md).

## RECON: Current Behavior

Facts from the baseline:

- `shift_templates` (`packages/db/src/schema/scheduling.ts`) belong to a **site**. Their columns are
  `code`, `name`, `local_start`, `local_end`, `is_night` and `is_active`, with `(site_id, code)`
  unique. `seed-defaults.ts` creates `DAY` 08:00–20:00 and `NIGHT` 20:00–08:00 for each site.
  `TemplatesService` can list and create templates (`POST /admin/schedules/templates`, ADMIN).
  No panel screen manages them.
- `planInstants` (`packages/domain/src/time/plan.ts`) treats an end at or before the start as the
  next day, so 08:00–08:00 is a 24-hour shift. DST is handled.
- Assignments store `plan_start_at`/`plan_end_at` and optional per-day `custom_start`/`custom_end`
  (SC-32).
- `ScheduleService.replaceAssignments` rewrites the whole month on every save. It recomputes each
  item's instants from the **current** template and rejects inactive templates (`activeBySite`).
  So today a template edit would move saved items on the next save, and removing a template would
  make every month that uses it impossible to save.
- A schedule version belongs to one unit and one month. Planning a person from another unit is
  borrowing (D-06). The workspace loads **all** site templates (`use-workspace.ts`). The
  assignment editor is a Sheet with Employee / Date / Zone / Shift (select) / Custom time fields.
- The day/night meaning is a boolean, `isNight`. These readers use it:
  - calendar kind (amber/indigo);
  - workload night count;
  - bot, reminder and change-notice texts;
  - iCal feed;
  - XLSX export;
  - `templateLabel`.
- These readers take **every** active site template:
  - unscheduled QR arrival inference;
  - the Overview shift context;
  - schedule day/night hotkeys;
  - the bot "extra shift" request.
- In Directories → Units, each row has an "Assign master" button that opens `UnitMasterPicker`
  (a Sheet). The tree view has the same action.
- `docs/engineering/table-filter-standard.md` T5/T6 forbids a generic row tap that opens a mutation
  form. The owner explicitly requests a row-click Sheet here (FR-001).

### Competitor reference (research 2026-09-23)

- **When I Work** is the only competitor with named, scoped shift templates.
  - Templates live on their own page and hold start, end (up to 24 h), unpaid break, color,
    position, schedule and notes.
  - A template shows only on the schedules it is assigned to.
  - Clicking an empty cell lists templates first, with "Create Custom Shift" as the fallback.
  - The picker ranks templates for the person. Unfit ones stay visible, greyed, and selectable.
  - A shift can be saved as a template from the scheduler.
  - Overnight shifts are marked and appear on their start date.
  - Editing a template does not change shifts already created from it.
- **Deputy** has no named shift types.
  - Each location/area sets default hours and length.
  - Each area has one colour, used on the schedule and in the export.
  - Suggested values are marked. You can override a warning.
- **Worksection** is a project and task tool without shift scheduling. Nothing to take.

## SPEC: Outcome and Boundaries

An administrator opens a unit from the units table (row click) or from the tree. One Sheet manages
the unit's master and the unit's own shifts. A shift is defined by its start and end. The type
(Day / Night / Full day) is derived from those times and can be changed. The name is optional.
Planners of that unit's schedule pick a shift from a list of cards: the unit's shifts first, then
the defaults. "Custom time for this day" stays available as the fallback. A shift is a template.
An assignment keeps the hours it was given, so editing or deleting a template never changes
already planned shifts.

Non-goals:

- inheritance from parent units;
- editing or hiding site defaults from the unit Sheet;
- shifts longer than 24 h;
- unpaid breaks on templates (planned breaks already exist per assignment);
- per-template colours (colour is fixed by type);
- rotations (saved patterns already exist);
- night-rate or payroll rules;
- a site-level template screen;
- ranking candidates by preference.

Assumptions (defaults; change only on owner request):

- Only `ADMIN` creates, edits and deletes unit shifts and assigns the unit master. All panel roles
  can read unit shifts.
- Custom names are user data and are not translated. The defaults keep their localized labels. A
  shift without a name is shown by its time range.
- Full day lasts exactly 24 local hours, so start equals end. On DST dates it lasts 23 or 25 hours.
  Day and Night require start ≠ end, and either may cross midnight.
- The suggested type is Full day when start = end, Night when the shift crosses midnight or starts
  at 18:00 or later, and Day otherwise.

## User Scenarios and Testing

### US1: Unit Sheet replaces the master button (Priority: P1)

- **AC-001**: The Master column shows only the master's name, or "not assigned" when there is none.
  There is no "Assign master" button. Clicking a row opens the unit Sheet. Keyboard users use
  the row menu's first item, "Open", the same as on Employees. Using the rest of the `…` menu does not
  open the Sheet.
- **AC-002**: A "Shifts" column shows the unit's shifts as time chips coloured by type (at most three,
  then "N more"), or "Standard" when the unit has none. In the tree view, activating a unit opens the same Sheet.
- **AC-003**: The Sheet shows the unit name, its site or parent, the Master field and the Shifts
  section.
  - Master: saving is disabled until the selection changes. Clearing the master is allowed.
  - Closing the Sheet returns focus to the row.
  - At 375 px the Sheet is full width and every control is reachable.
- **AC-004**: Every non-ADMIN user, masters included, sees the Sheet read-only, with no save, add,
  edit or delete controls. Every mutation endpoint returns 403 to them.

### US2: Create, edit and delete unit shifts (Priority: P1)

- **AC-005**: Each shift in the Shifts section is a row. The row shows:
  - a colour bar for the type;
  - the time range as the main text, with "+1" when the shift ends the next day;
  - the name (when there is one), the type pill (text + colour) and the duration (`formatDuration`).

  Rows are sorted by type (Day, Night, Full day), then start, then name. Edit and delete appear on
  hover and focus; on touch screens they are always visible. Below the list, a collapsed "Standard
  shifts — for all units" group lists Day and Night with a lock icon.

- **AC-006**: With no own shifts, an empty state says the unit works on the standard shifts and offers
  "Create the first shift". Otherwise a "New shift" button opens the same inline form.
- **AC-007**: The form has these fields, in order:
  - Start and End;
  - duration presets **6 / 8 / 12 h** (a full day is chosen by type), which set End = Start + N, with the resulting duration
    and "until the next day" when the shift crosses midnight;
  - Type (a three-way control), set automatically from the times until the administrator picks one;
  - an optional Name, whose placeholder is the time range;
  - a live preview of the calendar card.

  Create/Save stays disabled until the form is valid and changed.

- **AC-008**: These inputs are rejected with an inline message:
  - a name already used by another current shift of the unit, case-insensitive (an empty name
    compares as its time range);
  - a name over 60 characters;
  - Full day with start ≠ end;
  - Day or Night with start = end;
  - malformed times.

  The server enforces the same rules, and SQL enforces the type/time invariant.

- **AC-009**: Every field of a unit shift can be edited. For a shift that is used, the form says "The
  new hours apply to new assignments. N already planned shifts stay as they are." Saving never changes
  any existing assignment.
- **AC-010**: Delete asks for confirmation, stating how many planned shifts stay as they are. After
  deletion the shift is gone from the unit list and from every picker.
  - A shift used nowhere is removed completely.
  - A used shift is kept for history. Planned shifts, the calendar, the export and the bot still show
    its name and hours.
  - Those planned shifts can be saved unchanged or given another shift. Moving one to another person
    or date also means choosing a current shift.
  - Staffing requirements for the deleted shift end today, with an audit record.
  - Saved patterns that reference it show it as unavailable.
- **AC-011**: Every create, edit and delete appends a domain event and an audit record. A stale edit
  (the shift changed after the Sheet loaded) is rejected with a conflict, and the draft is kept.

### US3: Schedule offers the unit's shifts (Priority: P1)

- **AC-012**: In the schedule of unit A, the assignment editor offers shifts as a single-choice list
  of cards in three groups:
  - "Shifts of «A»";
  - "Standard";
  - "Custom time for this day".

  Each card shows the time range, the name, the type and the duration. A card that fails an existing
  eligibility rule for this person and date is still visible and selectable, but greyed, with the
  reason (overlap, rest below the minimum, absence). The primary "Assign" button stays visible at
  the bottom of the Sheet.

- **AC-013**: For a borrowed employee from unit B, the editor keeps its existing "Borrowing from «B»"
  notice. The picker offers A's shifts under the heading "Shifts of «A»". No second explanation is
  added (owner rule: never explain the same thing twice).
- **AC-014**: The batch planner, copy period, staffing requirements and open-slot creation offer the
  same set: the defaults plus A's current shifts. They never offer another unit's shifts.
- **AC-015**: With custom time selected, an administrator can use "Save as a shift of «A»". It creates
  the unit shift with the suggested type and selects it.
- **AC-016**: The server rejects a new or changed assignment, open slot or staffing requirement whose
  template is neither a default nor a current shift of A. The errors are `SHIFT_TEMPLATE_OUT_OF_UNIT`
  and `SHIFT_TEMPLATE_RETIRED`, both localized. A retired or foreign template is still accepted on a
  date where the version or the published month already plans it, or where an open slot of the unit
  offers it. This covers unchanged plans, swaps and slot fills. Staffing demand and qualification
  rules compare versions of one shift as the same shift. An approved extra-shift request plans the
  current version of the requested shift.
- **AC-017**: An assignment keeps the hours it was created with. An hours or type edit of a used
  template retires that version and inserts a new one (ADR-0017). Assignments keep the version
  they were planned with, so later saves of the month never change their instants. New
  assignments take the current version.
- **AC-018**: A calendar card shows the zone, the time range and "name · duration". A default shift
  shows its type as the name. The colour follows the type: Day amber, Night indigo, Full day
  fuchsia (a new hue). Text or an icon always accompanies colour. A Full-day shift also marks the
  next day with a dashed "full day until HH:MM" cell.
- **AC-019**: A Full-day assignment blocks overlaps. REST and MONTH_HOURS use its real 24 h interval.
  The workload summary counts Full-day shifts separately from Day and Night.
- **AC-020**: The day/night hotkeys pick the site default Day or Night, never a unit shift.

### US4: Downstream readers stay correct (Priority: P2)

- **AC-021**: For an unscheduled QR arrival, the shift is inferred from the defaults plus the current
  shifts of the employee's current unit.
- **AC-022**: The Overview's current/next shift context uses the defaults only.
- **AC-023**: The bot's "extra shift" request lists the defaults plus the employee's unit shifts. Bot
  reminders, change notices, "My plan" and the iCal feed name the type (день/ніч/доба in the
  employee's locale) and show the planned times. No close-shift button appears (C4).
- **AC-024**: The XLSX export shows the name of a unit shift, or the type when there is no name.

### Edge Cases

- **Unit moved to another site**: blocked while the unit owns shifts (composite FK), with an explicit
  error.
- **Unit deleted**: blocked while shifts reference it. Delete the shifts first.
- **Employee changes unit mid-month**: existing assignments are unchanged, and new ones follow AC-012.
- **DST**: a Full-day or Night assignment on a transition date lasts 23/25 h or 11/13 h. Tests cover
  this.
- **Template edited while a planner has a local draft**: the draft's new items take the hours shown
  when they were chosen. The server copies the current template hours for new or switched items.
  Any difference shows in the existing review/diff before publishing.
- **Legacy site without defaults**: pickers show only unit shifts. The existing "no active
  templates" notice appears when there are none.
- **Bonus weighting**: `plannedMinutes/720` already scales with the real duration.

## Requirements

### Functional Requirements

- **FR-001**: Units table rows and tree units open a unit Sheet. This is an owner-authorized
  exception to T5/T6, recorded in that standard. Verified by AC-001–004.
- **FR-002**: A shift template belongs to a site and optionally to one unit of that site. Site
  defaults have no unit. Verified by AC-005 and AC-012–014.
- **FR-003**: `ShiftPeriod = DAY | NIGHT | FULL_DAY` (C9) replaces `isNight`, with the SQL check
  `FULL_DAY ⇔ local_start = local_end`. The domain function `suggestPeriod` derives the type.
  Verified by AC-007, AC-008, AC-018 and AC-019.
- **FR-004**: ADMIN creates, edits and deletes unit shifts, with audit, events and revision checks.
  A used shift is soft-deleted. Verified by AC-006–011.
- **FR-005**: Templates in use are versioned (retire + replace), so template edits and deletion never
  change existing assignments. Verified by AC-009, AC-010 and AC-017.
- **FR-006**: Schedule pickers and server validation are scoped to the defaults plus the current
  shifts of the schedule's unit. The picker shows eligibility reasons without blocking selection.
  Verified by AC-012–016 and AC-020.
- **FR-007**: Arrival inference, the Overview, bot requests, messages, the feed and the export read
  the scoped set and the new type. Verified by AC-021–024.

### Key Entities

- **Shift template** (existing) gains these columns:
  - `org_unit_id`: null means a site default; a composite FK ties it to the unit's site.
  - `period`.
  - `revision`.
  - `retired_at`.
  - `replaced_by_id`: the version that took over after an hours edit.
  - `updated_at`.

  `name` may be empty for unit shifts. `is_night` is migrated into `period` and dropped. `code`
  stays the internal identity. Assignments are unchanged.

- **Shift period**: Day, Night or Full day, each with a colour and a localized name.

## Success Criteria

- **SC-001**: An administrator creates a unit shift from the units table in one Sheet. A planner
  then sees it in that unit's schedule and in no other (AC-006, AC-012, AC-014).
- **SC-002**: Editing or deleting a shift leaves every planned assignment's hours and instants
  unchanged, and every month stays saveable (AC-009, AC-010, AC-017).
- **SC-003**: No other unit's shift can be saved into a schedule, through the UI or the API (AC-016).

## Verification Scope

This change needs invariant tests and one independent review
(`docs/engineering/testing-baseline.md`), because it includes a migration with a backfill of
assignment hours, schedule and attendance time behavior, and access rules (ADMIN mutations and
unit scope). Affected surfaces:

- the Directories units table and unit Sheet, on desktop and mobile;
- Schedule, on desktop and mobile;
- the Telegram extra-shift keyboard and texts.

The kiosk is unaffected. plan.md lists the exact checks.
