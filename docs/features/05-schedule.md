# Schedule (spec 3)

Planned successor: [Schedule calendar redesign](schedule-calendar-redesign.md) describes the complete
page redesign and its ranked requirements. It is not implemented; the behavior below remains the
current operational reference.

The Schedule page is one planning calendar per site and unit, modelled on When I Work and Deputy.
Choose the unit, navigate by day, week or month with the period picker and Today, and group the
calendar by zones or by workers; the month always opens the worker day/night matrix. Column headers
show day/night counts for each date and every row shows its shifts and planned hours for the period.
Counts describe assigned people, not required staffing or attendance.

- **Working plan:** editors see the unpublished month when one exists, approvers see what awaits
  them, and everybody else sees what workers see. The status line says whether the plan is published,
  a draft workers cannot see, or awaiting approval, and how many changes are not published yet.
  Unpublished shifts carry a dashed border and an icon. When a draft exists next to a published month,
  the actions menu switches between them; there is no version list, number or history on this page.
- **Edit in place:** click an empty cell to add a shift with the selected date, worker or zone, or
  click a shift to change its date, zone or template or remove it. Add assignments plans several
  workers over a date range with a shift or rotation; fill-empty preserves occupied dates, replace may
  remove off-days, and exact additions/removals/changes are previewed before applying. Undo/redo and
  Discard work on local edits, which survive navigation and reload.
- **Publish:** Review and publish lists exact additions, removals and changes with the affected
  workers and an optional reason. An administrator or production head publishes directly; a planner
  saves the draft and sends it for approval, and the approver publishes or returns it with a comment.
  A planner editing a published month starts a draft copy on the first change. Publication queues
  worker notifications; it does not prove delivery. Download XLSX exports the complete saved plan.
- **Across months:** a week keeps all seven dates. Dates of the neighbouring month show that month's
  plan muted and read only, with one note naming it; navigating onto such a date opens that month.
  Changes always belong to the month you have open.
- Local drafts are owned by the signed-in account. A changed server plan blocks a stale overwrite
  and keeps local work available for reconciliation. Filters never narrow the complete monthly write.
- **Staffing coverage:** administrators and production heads define how many people each zone
  needs per shift and which qualification they must hold (Staffing requirements in the actions
  menu); administrators and HR record who holds which qualification and until when. Zone rows show
  missing people or "not defined"; cells show eligible/required per shift. A zone whose every
  requirement demands a qualification refuses an unqualified or expired worker at save.
- **Conflicts and candidates:** the plan is checked as you edit: overlapping shifts of one person
  in any unit, approved absences and missing required qualifications block saving and publishing;
  short rest and too many monthly hours warn or block according to the site rules; a worker's
  recorded unavailable days warn. Cards carry a red or amber mark, the status line counts the
  conflicts and the shift details explain each reason. When adding a shift, the editor lists
  candidates for that zone, shift and date with their reasons, own unit first. Site rules and
  availability preferences live in the Staffing requirements Sheet.
- **Who may plan:** administrators and planners plan the whole unit. A shift master whose access
  covers the unit prepares, saves and sends the draft for approval; a master limited to a zone
  changes only that zone's shifts and reads the rest. Publishing, returning and revising a
  published month stay with administrators and production heads. The server enforces the same
  rules for direct API use.
- Inactive records retain their historical names; only active workers, zones and templates can
  receive new assignments. Server assignment validation remains authoritative; rest, monthly-hour
  limits and cross-unit overlap are not checked on this page.

Versions remain a server-side storage and audit mechanism (published plans supersede earlier ones,
attendance and bonus records keep their links). Owner decision 2026-09-13: they are no longer a
concept of the Schedule interface.

Implementation and evidence: [schedule workspace](../engineering/features/schedule-workspace.md).

Employees see their plan in the bot under "Мой план". Shift reminders are scheduled 30 minutes before
the published assignment starts, in the site's timezone (06:30 start → 06:00 reminder). Delivery
rechecks the current plan and approved absences: vacation, sick leave and day off covering the shift's
business date suppress the reminder. Pending/rejected absence requests do not suppress it. Cancelled
or replaced assignments, superseded schedules, inactive employees and already started shifts do not
receive a start reminder. This does not change schedule-publication or acknowledgement messages.

See [shift reminder delivery](../engineering/features/shift-reminders.md) for queued-message handling
and verification evidence.
