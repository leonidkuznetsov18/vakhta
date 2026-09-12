# Schedule (spec 3)

The schedule workspace starts with the current published month, grouped by zone. Select the
site (when more than one is available), unit and month. Day/night assignment counts and planned
person-hours describe the selected period and zones; they are not staffing requirements or attendance.

- **By zones:** desktop defaults to a week, mobile to a day. Switch day/week/month, navigate dates,
  and open a zone/date to read its day and night teams. Empty active zones remain visible.
- **By workers:** a monthly matrix with worker search, assignment totals and planned hours.
  Arrow keys navigate one roving cell focus; Enter opens the assignment, D/N changes its template,
  and Delete clears it. Creating an empty cell asks for its zone instead of guessing a monthly zone.
- **Change history:** saved versions open inline as read-only assignment lists. Server-permitted
  deletion remains available only to scoped editors and requires confirmation.
- **Edit schedule / Continue draft:** explicit entry into editing. Each assignment owns its date,
  template and zone. Unchanged kind, position and team metadata survive serialization.
- **Add assignments:** select workers, a zone and date range, then a shift or rotation. Fill-empty
  preserves occupied dates; replacement may remove off-days. Review exact additions/removals/changes
  before applying. Undo/redo reverse local actions, and discard restores the saved baseline.
- Local drafts survive navigation/reload. Legacy drafts require explicit reconciliation against
  saved assignments. A changed server baseline blocks stale overwrite and keeps local work available
  for recovery. Filters never narrow the complete monthly write payload.
- Draft lifecycle remains DRAFT → IN_REVIEW → PUBLISHED. Admins/planners save and submit; scoped
  admins/production heads publish or return with a comment. Masters retain existing read-only rights.
- Published editing by an admin/production head uses the existing atomic revise endpoint: a new
  publication supersedes the old version. Review shows exact changes and affected people before
  sending the optional reason. The success message says notifications were queued, not delivered.
- Inactive records retain their available historical names; only active workers/zones/templates can
  receive new assignments. Employee list retrieval is currently capped at 200; missing scheduled
  identities are fetched individually when the role permits it. This is not a complete searchable roster.
- Server assignment validation remains authoritative. This page does not automatically check rest,
  monthly-hour limits or cross-unit overlap, and does not contain an acknowledgement/reminder table.

Implementation and evidence: [schedule workspace](../engineering/features/schedule-workspace.md).

Employees see their plan in the bot under "Мой план". Shift reminders are scheduled 30 minutes before
the published assignment starts, in the site's timezone (06:30 start → 06:00 reminder). Delivery
rechecks the current plan and approved absences: vacation, sick leave and day off covering the shift's
business date suppress the reminder. Pending/rejected absence requests do not suppress it. Cancelled
or replaced assignments, superseded schedules, inactive employees and already started shifts do not
receive a start reminder. This does not change schedule-publication or acknowledgement messages.

See [shift reminder delivery](../engineering/features/shift-reminders.md) for queued-message handling
and verification evidence.
