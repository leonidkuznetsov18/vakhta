# Feature: unit shift templates

## Outcome and scope

Units work different hours: some start at 05:00, some work 6 or 8 hours, some a full day. An
administrator creates shifts for a unit in Administration → Directories → unit Sheet. Planners see
them in that unit's Schedule, next to the standard Day and Night. Change: `specs/013-unit-shift-templates/`.
Product documents: [Schedule](../../features/05-schedule.md), [Admin panel](../../features/11-admin-panel.md).
Decision: [ADR-0017](../../adr/0017-unit-shift-templates.md).

## Current behavior and ownership

- **Domain** (`packages/domain/src/scheduling`):
  - `ShiftPeriod` (DAY / NIGHT / FULL_DAY).
  - `shift-templates.ts`: suggested type, the hours rule, display name, unit scope
    (`templatesForUnit`, `isTemplateSelectable`), order, error and event codes.
- **Database** (migration 0053): `shift_templates` gains `org_unit_id` (composite FK to the unit's
  site), `period`, `revision`, `retired_at`, `replaced_by_id` and `updated_at`. `is_night` is kept
  for one release as a read-only generated mirror of `period`.
  SQL checks cover the full-day rule, the retirement rules and a unique current name per unit (an
  unnamed shift counts as its hours).
- **API** (`TemplatesService`, `admin-schedules.controller.ts`):
  - `GET templates?siteId&orgUnitId&includeRetired` returns rows with `usedCount`.
  - `POST units/:orgUnitId/templates`, `PATCH templates/:id` and `DELETE templates/:id?revision`
    are ADMIN only, and each writes an event and an audit record.
  - `replaceAssignments`, staffing and open slots refuse other units' or retired templates, except
    on dates already planned or offered with them.
  - Arrival inference, the Overview, the bot's extra-shift request, notices, reminders, iCal and the
    XLSX export read `period`.
- **Panel**:
  - `entities/shift-template`: API, query factory, labels, colours, `PeriodBadge`, `ShiftChip`,
    `ShiftHours`.
  - `features/unit-settings`: `UnitSheet` with a master slot, the shifts section and the form, and
    the pure draft model.
  - `features/employee-profile/UnitMasterField` replaces the master picker Sheet.
  - Schedule: `ShiftPicker` cards in the assignment editor, `w.shiftOptions` for every choice,
    `w.templates` (including retired versions) for labels.
  - `admin/DirectoriesTab` composes the Sheet.

## Decisions and reuse

- Research of When I Work, Deputy and Worksection (2026-09-23) is recorded in the spec. We adopted:
  - templates first, with custom hours as the fallback;
  - unfit options greyed but selectable;
  - saving custom hours as a template;
  - editing a template never changes created shifts.
- The prototype (throwaway, removed) validated the one-Sheet layout, 6/8/12/24 presets, the
  suggested type, the optional name and card pickers.
- We version templates instead of snapshotting assignment hours (ADR-0017), so no assignment
  migration is needed.
- Owner decisions: ADMIN only; the schedule's unit (not the home unit) for borrowed workers;
  defaults always offered; no inheritance; Full day is its own type with a fuchsia hue.
- A row-click Sheet is a documented table-standard exception. Keyboard users reach it through
  the row menu "Open", as on Employees.

## Verification

2026-09-24, local, baseline `0f868f54`:

- **Domain**: `vitest` 218 passed, including fast-check properties for scope and the hours rule, and
  DST lengths of a full day.
- **Contracts**: 24 passed. **i18n** catalog parity: 13 passed.
- **API** (testcontainers PostgreSQL 16):
  - `templates.service.test.ts` (11): scope, 403 for a master, unique names, stale revision, SQL
    checks, in-place edit, versioned edit keeping assignment instants, retired template refused
    for new person-days, staffing carry-over, retire vs delete, other unit refused, full day.
  - Plus: scheduling, requests (the extra shift refuses another unit), overview and shift (arrival
    ignores other units): 36 + 88 passed.
- **Worker**: 53 passed. **Admin-web**: all 84 files / 557 tests passed, plus the new unit-settings,
  Directories and picker tests.
- **Static checks**: `tsc` for every changed package; `eslint --pass-on-unpruned-suppressions` over
  apps and packages with no new suppressions.
- **Migration** 0053 applied to the local development database; DAY/NIGHT were backfilled to
  `period` with no violations.
- **Visual**: Playwright screenshots of the panel preview at desktop 1280×900 and mobile 375×812
  (units table with shift chips, unit Sheet list/new/edit/delete, Schedule editor picker)
  compared against the prototype. The local API did not finish booting in this session (it hung
  before `listen`, with Redis on 6380 and PostgreSQL reachable), so these views used preview
  fixtures rather than the running API.
- **Independent review** (code-reviewer): four defects confirmed and fixed with tests.
  - Deleting a successor version failed its FK.
  - Open slots and swaps were blocked on a retired version.
  - An extra-shift approval used a retired template.
  - Coverage showed false shortages across versions.

  Retest: `templates.service.test.ts` (13), `requests.service.test.ts` (11),
  `use-staffing.test.ts`, then API scheduling/requests/shift/overview/telegram/attendance (189)
  and admin-web (558), all passed.

## Remaining work

- Check production shift templates for `local_start = local_end` before releasing migration 0053
  (only DAY/NIGHT were seeded).
- Drop the generated `shift_templates.is_night` column, a read-only mirror kept for the rolling
  deploy, in the next release.
- Reviewer risks not changed: the template list is readable by every panel role, as the site
  list was before; an employee with positions in two units sees one unit's shifts for extra-shift
  requests; the Schedule's staffing query refreshes on its own schedule after an hours edit.
- Deployed verification of the unit Sheet and picker against the real API.
- Investigate why the local API bootstrap hangs before `listen` in this checkout (unrelated to the
  change; affects local QA).
