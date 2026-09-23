# Implementation Plan: Unit shift templates

**Change**: 013-unit-shift-templates | **Date**: 2026-09-23 | **Spec**: [spec.md](spec.md)
**Baseline**: 0b0f78cc | **Checkout**: master
**Engineering memory**: `docs/engineering/features/unit-shift-templates.md` (new)

## Summary

Extend the existing `shift_templates` instead of adding a table: add an optional unit owner, an
explicit `ShiftPeriod`, a revision and retirement with a replacement version. A used template is
versioned on an hours edit, so planned shifts keep their hours (When I Work model, ADR-0017). ADMIN
creates, edits and deletes, and every reader is scoped to "site defaults + one unit". The unit Sheet
and the card-based shift picker follow the accepted prototype v2 (throwaway, removed on delivery).
`planInstants` already supports overnight and 24 h shifts.

## Technical Context

- **DB**: Drizzle schema `packages/db/src/schema/{scheduling,org}.ts`, next migration `0053_*`,
  seed `seed-defaults.ts`.
- **Domain**:
  - `packages/domain/src/scheduling/{types,calendar,workload}.ts`;
  - `time/{plan,shift-window}.ts`;
  - new `scheduling/shift-templates.ts`.
- **Contracts**: `packages/contracts/src/scheduling.ts`.
- **i18n**: `packages/i18n` (uk/en/ru together).
- **API**:
  - `apps/api/src/scheduling/*`: `templates.service`, `admin-schedules.controller`,
    `schedule.service` (`replaceAssignments`), `staffing.service`, `open-slots.service`,
    `patterns.service`, `schedule-export.service`, `feed.service`, `calendar-feed`,
    `schedule-change-notice`;
  - `shift/shift.service.ts`;
  - `overview/overview.service.ts`;
  - `requests/requests.service.ts`;
  - `telegram/screens.ts`.
- **Worker**: `apps/worker/src/timers/{events,shift-reminder-policy}.ts`.
- **Panel**:
  - `admin/DirectoriesTab.tsx`;
  - `features/org-structure`;
  - `features/employee-profile` (`UnitMasterPicker`);
  - `features/schedule-management`: model, `lib/template-label`, `ui/assignment-editor`, the other
    pickers and calendar colours.

## Constitution Check

- **C2**: `suggestPeriod`, validation, scoping and ordering are pure functions, with tests.
- **C3/C4**: no FSM or interval writes, and no bot close button.
- **C5**: `shift_period` pgEnum and `timestamptz`. Invariants live in SQL: the period/time check,
  the composite FK from unit to site, a partial unique name per unit, and the retirement checks.
- **C6**: events and audit are append-only.
- **C8/C9**: `ShiftPeriod` is an `as const` object with `z.enum` and `pgEnum`. Lookup maps handle
  colour and label. No new suppressions.
- **React policy**: none of the forbidden hooks. Server state lives in TanStack Query, the form draft
  in component state, and disabled states are derived.
- **UI rules**:
  - Full-day fuchsia is added to the AGENTS palette. The hover/selection sky ring and the orange
    warning are reused as defined.
  - Tooltips come from i18n. Duplicate explanations are not allowed, so each hint is an `InfoTip`
    or visible text, never both.
  - Use `formatDuration` for durations.
- **Table standard T5/T6**: the row-click unit Sheet is an owner-authorized exception, recorded in
  the standard.
- **Access**: every mutation is `@Roles('ADMIN')`.

## DESIGN: Ownership and Behavior

### Data (migration 0053)

Implementation decision 2026-09-24: templates are versioned instead of copying hours onto
assignments (ADR-0017). This gives the same guarantee without touching assignment rows.

```
org_units         + UNIQUE (id, site_id)
shift_templates   + org_unit_id uuid NULL              -- null = site default
                  + period shift_period NOT NULL       -- backfill: is_night → NIGHT else DAY
                  + revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
                  + retired_at timestamptz NULL, replaced_by_id uuid NULL → shift_templates
                  + updated_at timestamptz NOT NULL DEFAULT now()
                  CHECK local times HH:MM; (period = 'FULL_DAY') = (local_start = local_end)
                  CHECK unit rows: is_active = (retired_at IS NULL); defaults never retired
                  CHECK replaced_by_id only on retired rows; defaults named
                  FK (org_unit_id, site_id) → org_units (id, site_id)
                  UNIQUE (org_unit_id, lower(coalesce(nullif(btrim(name), ''), start–end)))
                    WHERE org_unit_id IS NOT NULL AND retired_at IS NULL
                  - is_night dropped
```

Unit shifts get the internal code `U_` + the row id without dashes. It is never shown.

### Domain (pure)

- `SHIFT_PERIODS`/`ShiftPeriod`. `PlannedShift.isNight` becomes `period`, `DayKind` becomes
  `ShiftPeriod | 'OFF'`, and the workload gains `fullDayShifts`.
- `scheduling/shift-templates.ts` exports:
  - `suggestPeriod(start, end)`;
  - `validateTemplateTimes(period, start, end)`;
  - `templateDisplayName(template)`, which falls back to the time range;
  - `templatesForUnit(templates, orgUnitId)`, which returns current defaults plus current unit shifts;
  - `isTemplateSelectable(template, orgUnitId)`;
  - `compareTemplates(locale)`.
- `inferShiftFromArrival` and `shiftContext` read `period`.

### Contracts

- `ShiftTemplateView` adds `orgUnitId`, `period`, `revision`, `retiredAt`, `replacedById` and
  `usedCount`, and drops `isNight`.
- `CreateUnitShiftCommand` takes `orgUnitId`, `name?`, `period`, `localStart` and `localEnd`, with a
  refinement that applies the time rule.
- `UpdateUnitShiftCommand` takes `revision`, `name?`, `period`, `localStart` and `localEnd`.
- `CreateShiftTemplateCommand` (site defaults) takes `period` instead of `isNight`.

### API

- **List**: `GET /admin/schedules/templates?siteId[&orgUnitId][&includeRetired]` is open to all
  panel roles. `usedCount` comes from one grouped count over PLANNED assignments in non-superseded
  versions.
- **Mutations**, all `@Roles('ADMIN')` plus an ADMIN scope check, each in one transaction with an
  event and an audit record:
  - `POST /admin/schedules/units/:orgUnitId/templates` creates a unit shift.
  - `PATCH /admin/schedules/templates/:id` (409 `SHIFT_TEMPLATE_STALE` on a stale revision) edits in
    place when the template is unused or only the name changes. Otherwise it retires the template,
    inserts the successor, sets `replaced_by_id`, carries running staffing demand from today and
    repoints saved patterns.
  - `DELETE /admin/schedules/templates/:id?revision` hard-deletes an unused shift, together with
    its staffing rows. A used shift is retired, and its staffing demand ends today; future demand
    is dropped.
- **`replaceAssignments`**: loads every site template, retired ones included. A template that is
  not selectable for the version's unit passes only on a date where the version, the month's
  published version or an open OPEN/OFFERED slot of the unit already has it. Qualification rules and
  eligibility compare template versions through `templateLineage`. Otherwise the save fails with 422
  `SHIFT_TEMPLATE_OUT_OF_UNIT` or `SHIFT_TEMPLATE_RETIRED`. Staffing and open slots apply
  `isTemplateSelectable` against the zone's or slot's unit.
- **Scoped reads**: `ShiftService.activeTemplates(siteId, unitId)` and `RequestsService.templatesFor`
  return defaults plus the unit's shifts. `OverviewService` returns defaults only.
- **Messages**: `kindNames` gains `FULL_DAY`, and readers use `kindNames[period]`. The export and iCal
  use the display name.

### Panel (FSD), following prototype v2

- **New slice** `features/unit-settings/`:
  - `api/` for queries and mutations;
  - `model/` for the view model: sorting, the draft state, `suggestPeriod` until the type is touched,
    duration presets, `canSave`, `isAdmin`;
  - `ui/unit-sheet.tsx` with the Master field and the Shifts section (rows, empty state, collapsed defaults);
  - `ui/unit-shift-form.tsx` with times, presets 6/8/12/24, type, optional name and a live card preview;
  - `ui/delete-shift-dialog.tsx`;
  - `index.ts`.

  `UnitMasterPicker` becomes the Master field inside the slice.

- **Directories**: the button is removed, a Shifts chip column is added and `DataTable.onRowClick`
  opens the Sheet. The `…` menu does not open it (tested). In `OrgTree`, `onAssignMaster` is renamed `onOpenUnit`.
- **`schedule-management`**:
  - `templates` comes from `templatesForUnit(all, orgUnitId)`, and `allTemplates` from history.
  - In `assignment-editor`, the Shift select is replaced by a `ShiftPicker`: a radiogroup of cards
    (unit / standard / custom time).
    - Eligibility reasons come from the existing `use-eligibility` output for that person and date.
    - A card with a reason is greyed but selectable.
    - For ADMIN, "Save as a shift of «unit»" appears under custom time.
    - The assign action sits in a sticky footer.
  - `templateLabel` uses the display name, or the localized type for a default.
  - Calendar colours come from a period map, and the next day of a Full-day shift gets a
    continuation cell.
  - Hotkeys pick defaults by period.
- **Cache**: every mutation invalidates the templates query and the scoped schedule queries.
  Mutations never auto-retry, and the draft survives a failure.

### Compatibility and migration risk

- **Template backfill**: `is_night` → `period`. If any legacy template has start = end, the check
  fails, so query staging and production before release (only DAY/NIGHT are seeded).
- **Assignment backfill**: copies the hours currently implied by `custom*` or the template, so
  stored instants do not change. The migration test compares instants before and after.
- **Existing clients**: after the backfill, old clients read the same instants.
- **Multi-tenant**: the migration runs per tenant database through the existing migrator.

## Project Structure and Allowed Files

The writer and index owner is this Claude session. Allowed paths:

- the paths in Technical Context;
- `packages/db/drizzle/0053_*.sql` and its meta;
- the new `packages/domain/src/scheduling/shift-templates{,.test}.ts`;
- the new `apps/admin-web/src/features/unit-settings/**`;
- tests beside the changed modules;
- the REPORT docs, the `AGENTS.md` palette line, and `docs/engineering/table-filter-standard.md`.

Remove the prototype file and its hook in `preview.tsx` when the real UI lands.

## Applicable Skills

- `supabase-postgres-best-practices`: migration and backfill.
- `nestjs-best-practices`: API.
- `vercel-react-best-practices` and `frontend-design`: the Sheet and the picker, following the prototype.
- `javascript-testing-patterns`: tests.
- `webapp-testing`: screenshots.

No Lean review.

## IMPLEMENT: Ordered Delivery

1. **Domain**: `ShiftPeriod`, `shift-templates.ts`, and the switch from `isNight` to `period`, with tests.
2. **DB**: schema, migration with the period backfill, seed. PostgreSQL invariant tests.
3. **Contracts and i18n.**
4. **API**:
   1. template CRUD with audit, events and revision;
   2. `replaceAssignments` scope rule;
   3. staffing, open slots and patterns;
   4. scoped readers and message readers.
5. **Worker readers.**
6. **Panel**:
   1. `unit-settings` slice;
   2. Directories and tree wiring;
   3. `ShiftPicker`;
   4. labels, colours and hotkeys.
7. **Docs and delivery**: docs, the table-standard exception, the palette and engineering memory,
   then one commit and push.

## VERIFY and HARDEN

- **Domain** (Vitest + fast-check):
  - `suggestPeriod`;
  - the time rule as a property;
  - FULL_DAY and Night on DST dates;
  - `templatesForUnit` never returns another unit's shift or a deleted one (property);
  - display name fallback;
  - ordering.
- **DB/API integration** (testcontainers):
  - backfills keep every assignment's instants and map `is_night`;
  - the constraints hold;
  - non-ADMIN users, masters included, get 403;
  - a duplicate name gets 409, and so does a stale revision;
  - a template hours edit, then re-saving a month, leaves the stored hours and instants unchanged;
  - a switched item takes the new hours;
  - deleting a used shift: the month is still saveable, a new item with that shift gets 422, and its
    staffing requirements end;
  - an unused shift is deleted completely;
  - saving another unit's shift gets 422;
  - arrival inference is scoped;
  - events and audit are written.
- **Panel**:
  - model tests: suggested type until touched, presets, `canSave`, sorting;
  - component tests:
    - no master button;
    - row click and Enter open the Sheet, `…` does not;
    - read-only for non-ADMIN;
    - the empty state;
    - the picker groups and ordering;
    - a greyed option with its reason is selectable;
    - a borrowed employee sees the schedule unit's shifts;
    - "Save as a shift" as ADMIN only.
- **Bot**: the extra-shift keyboard is scoped. Texts say "доба". The no-close-button test stays green.
- **Commands**: scoped `pnpm --filter` typecheck/lint/test for domain, db, contracts, i18n, api,
  worker and admin-web. `scripts/lint/clean-code.mjs` must not grow suppressions.
- **Visual QA** on the local stack at desktop and 375 px width:
  - the units table;
  - the unit Sheet: empty, list, new, edit, delete, read-only;
  - the Schedule editor picker, including a greyed option and a borrowed employee;
  - a Full-day card.

  Compare against prototype v2.

- **Independent review**: one `code-reviewer` pass over the migration, the versioning transaction,
  the scope rule in `replaceAssignments`, access and scoping.

## REPORT and Documentation

- Update `docs/features/05-schedule.md` (unit shifts, the picker, kept versions).
- Update `docs/features/11-admin-panel.md` (the unit Sheet).
- Update the table-standard exception and the AGENTS palette.
- Create `docs/engineering/features/unit-shift-templates.md` with the competitor reference and the
  prototype verdict.
- Add ADR-0017, "Unit shift templates, versioned so planned shifts keep their hours".

## Open Decisions

None blocking.
