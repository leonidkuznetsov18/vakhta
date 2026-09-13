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
- **Copy, patterns and moves:** Copy a period (actions menu) copies the previous week or month
  onto the current one with a preview of exact changes, skipped inactive references and rule
  reasons. Saved patterns store a rotation, shift, mode and zone for the batch planner. Drag a shift
  to another date or row, or use Move in its details to change the person, date or zone; an invalid
  move leaves the plan unchanged and explains why.
- **Custom hours and zone segments:** a shift keeps its template, but the editor can set its own
  start and end for that day (an end time before the start belongs to the next day) and split the
  shift into ordered zone segments that must cover the whole interval without gaps or overlaps.
  The card shows the custom hours and each segment; reminders and coverage use the custom interval.
- **Planned breaks, relief and workload:** the editor records planned breaks inside a shift, each
  with an optional relief, another worker planned over the whole break. A break without relief
  removes that person from zone coverage for its duration; a named relief must be planned, free and
  never cover two breaks at once, or the plan will not save. Workload (actions menu) lists planned
  shifts, nights, weekends, hours and breaks per worker for the visible week or the month, names the
  cohort and shows the difference from the cohort average. Planned figures only, never a verdict;
  recorded attendance and actual breaks stay where they are.
- **Open slots and offers:** an open slot is an unassigned place in the plan for a date, zone and
  shift (create one from the Add form). It never counts as a person or as covered demand and stays
  internal until a planner deliberately offers it to an explicit audience through the bot. Employees
  answer "interested" or "not interested"; a response never assigns. The planner selects one person
  from the responses into the draft; the slot fills exactly once, other responses stay in history,
  and the schedule is published as usual. Withdrawing an offer or cancelling the slot closes stale
  bot buttons.
- **Presence, absences and requests in context:** published shifts carry presence evidence from
  QR arrivals and shift sessions: scheduled, acknowledged, arrived, started, closed, or "no evidence
  recorded" after the planned start, which is never called a no-show. By-people view marks approved
  and pending absences per day; private attachments never appear. Shift details list the requests
  that touch the shift with their current step, open the Requests workflow for decisions (a swap
  changes both assignments there, atomically, or neither), and offer Find replacement, which opens
  the assignment with candidates and their eligibility. Planning a person from another unit shows
  the source unit and whether they are planned there that day; saving needs administrator or head
  of production authority, rechecked at commit.
- **Notes, records, reports, print and export:** a note on a date, zone or person has an explicit
  audience: planners only, or the employees concerned, who see it in their plan in the bot; long
  text stays inside a bounded scrollable box. Shift details link to the shift record in Live shift
  and to the Requests workflow; the calendar never repeats checklist or handover logic. The
  retrospective report (actions menu) puts the effective published plan next to recorded shift
  sessions: planned time, recorded work and unknown departure stay separate, a shift without any
  session is "no recorded session", and nothing infers OEE or fault; its XLSX states scope, month,
  timezone, version identity and generation time and stores every cell as text or number, never
  a formula. Print (actions menu) outputs the visible period with period, timezone, version
  identity and generation time and marks unpublished plans and unsaved local changes.
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

## Assignment fields (SC-50)

Every field has one meaning, one type and one audience. A standard shift needs only the first
four; the others are disclosed progressively and stay interpretable in history because the stored
planned instants and template reference never change after the fact.

| Field            | Type                              | Meaning                                                     | Audience                     | Required |
| ---------------- | --------------------------------- | ----------------------------------------------------------- | ---------------------------- | -------- |
| Employee         | reference                         | Who works the shift                                         | Planners, the employee (bot) | Yes      |
| Date             | business date                     | The calendar day the shift belongs to, also overnight       | Planners, the employee       | Yes      |
| Zone             | reference (unit zone)             | Where coverage is counted                                   | Planners, the employee       | Yes      |
| Shift template   | reference                         | Default hours and day/night kind; provenance for history    | Planners, the employee       | Yes      |
| Custom time      | local start and end (HH:mm)       | Replaces the template hours on that day only                | Planners, the employee       | No       |
| Zone segments    | ordered list (zone, start, end)   | Parts of one shift in different zones; must tile the shift  | Planners, the employee       | No       |
| Planned breaks   | ordered list (start, end, relief) | Break intervals and who relieves; never actual break events | Planners, relief employee    | No       |
| Kind             | code (REGULAR, EXTRA, …)          | Origin of the assignment (request effects set EXTRA/SWAP)   | Planners, reports            | Default  |
| Position, team   | reference                         | Optional organisational context                             | Planners, export             | No       |
| Note (planners)  | text ≤ 2000                       | Planning remark for the date, zone or person                | Planners only                | No       |
| Note (employees) | text ≤ 2000                       | Instruction shown in the employee's plan in the bot         | The employees concerned      | No       |
