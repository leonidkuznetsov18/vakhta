# ADR-0013: A published schedule is revised in place through an auto-published version

- Status: accepted
- Date: 2026-09-06
- Spec sources: 3.2, FR-SCH-03, 9.1 "График"

## Context

Spec 3.2 keeps every published schedule immutable: employees acknowledge a concrete version, worked
shifts reference its assignments, and the bonus criterion "start on time" compares with what was
planned at the time. The first implementation exposed that literally: a published month could be
changed only by creating a draft copy, editing it, submitting it for review and publishing it. The
customer found this unusable for the daily reality of a 24/7 site ("I cannot edit the version, I
cannot add an employee to the current version").

## Decision

The model stays; the interaction changes. For the roles that may publish (production head,
administrator) the grid of the published version is editable in place. "Опубликовать изменения"
calls `POST /admin/schedules/:id/revise` with the whole month: in one transaction the API inserts a
new version (`IN_REVIEW`, submitted by the actor), writes the assignments with the same validation
as a draft, and runs the publish step (supersede the current version, diff, notifications,
acknowledgement requests, audit). Validation errors roll the whole revision back, so no orphan
draft appears. Reminders are armed after the commit as for a normal publish.

Planners keep the draft flow ("Изменить график" creates a copy that goes through review), because
they cannot publish. Superseded versions remain read-only history; `ScheduleVersionView.deletable`
tells the panel whether a version can still be deleted (draft, or superseded with no worked shift).

## Consequences

Every save on a published month produces a version, so a busy month accumulates versions; the panel
shows them in a select ("Версия N · статус · дата") with the count, and superseded versions without
worked shifts can be deleted. The review step is skipped only for revisions by an approver; a new
month still goes DRAFT → IN_REVIEW → PUBLISHED.

## Rejected alternatives

Mutating the published version's assignments directly: breaks acknowledgements, the diff
notification and the bonus basis. Auto-creating a draft on the first edit and leaving it open: the
customer would again face two versions and a publish step; the draft would also silently diverge
from the live schedule.
