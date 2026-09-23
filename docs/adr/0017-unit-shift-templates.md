# ADR-0017: Unit shift templates, versioned so planned shifts keep their hours

- Status: accepted
- Date: 2026-09-24
- Decision owner: project owner
- Spec sources: 3 (schedule), 18 item 3 (shift templates); change `specs/013-unit-shift-templates`

## Context

Every site had two shift templates, Day 08:00–20:00 and Night 20:00–08:00. Units have different
work: some start at 05:00, some work 8 or 6 hours, some work a full day. Planners set custom hours
day by day. `ScheduleService.replaceAssignments` recomputes each saved item's instants from its
template, so changing a template's hours would silently move every planned shift on the next save,
past ones included.

The owner asked for administrator-managed shifts per unit, offered only in that unit's schedule,
and the ability to edit and delete them. We checked competitors: When I Work shift templates keep
existing shifts unchanged when a template is edited. The owner chose that behaviour over moving
future shifts and notifying workers.

## Decision

- A shift template belongs to a site and optionally to one unit of that site. A composite
  `(org_unit_id, site_id)` FK enforces this. Site defaults (no unit) are offered in every unit;
  a unit's templates only in its own schedule. There is no inheritance from parent units.
- The type is `ShiftPeriod`: DAY, NIGHT or FULL_DAY. It replaces `is_night`. SQL requires a full
  day to end when it starts; day and night shifts must not.
- **Templates are versioned, not assignments.** When an hours or type edit hits a template that
  an assignment or an open slot already uses, the template is retired (`retired_at`,
  `is_active = false`) and a new version is inserted. The old version records
  `replaced_by_id`. Assignments keep referencing the version they were planned with, so their
  recomputed instants never change. An unused template is edited in place; a name-only edit is
  always in place.
- Deleting an unused template removes it. Deleting a used one retires it: planned shifts keep it,
  and it disappears from every picker.
- Forward-looking settings follow the new version: running staffing requirements end yesterday
  and continue from today; saved patterns are repointed.
- A new or changed assignment, open slot or staffing requirement may use only a current site
  default or a current template of its unit. A retired or foreign template stays allowed only
  where the same person-day already had it in the version or the published month.
- Only ADMIN manages unit shifts. Unscheduled arrivals infer a shift from the defaults and the
  employee's own unit. The Overview's shift rhythm uses the defaults only.

## Consequences

- No migration of assignment rows and no change to instant computation; history stays exact.
- Template lists are asked for `includeRetired` where history is labelled (the Schedule) and
  for current rows where choices are made.
- Coverage of a past date keeps matching the requirement of the version planned on that date.
- A planner who kept a local draft across a template edit still saves it: unchanged person-days
  keep the retired version.

## Rejected alternatives

- Propagating an edit to future planned shifts with worker notifications. It is heavier, surprising
  in published months, and the owner chose the When I Work behaviour instead.
- Snapshotting hours on every assignment. It requires a backfill of all assignments and changes to
  every instant computation in API and panel, for the same guarantee.
