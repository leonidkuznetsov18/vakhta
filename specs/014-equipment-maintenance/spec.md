# Feature Specification: Equipment maintenance

**Change**: 014-equipment-maintenance | **Created**: 2026-09-24 | **Status**: Draft
**Baseline**: b4453be | **Checkout**: master
**Authority**: Owner request 2026-09-24 (Ukrainian, paraphrased): create a new feature with a database
of all machines on the production floor. Each machine gets its manufacturer manual, found on the
internet, downloaded and attached. Each machine has a clear planned maintenance (ТО) derived from
its manual. Planned maintenance is shown in a calendar. Each machine has its own responsible
mechanic who carries out the planned maintenance. We must know what has to be on hand to perform
it. The responsible mechanic receives a Telegram notice one week, three days and one day before the
maintenance is due. There must also be an emergency maintenance scenario. For now, write the
specifications. Supporting input: customer document «Техническое задание на систему обслуживания и
ремонта оборудования» v1.3 (TZ-M), summarised in [research.md](research.md).

**Scope decision recorded**: `docs/product-vision.md` lists "equipment" as out of MVP scope and
`AGENTS.md` requires a separate decision to add it. This owner request is that decision; it is
recorded in [ADR-0018](../../docs/adr/0018-equipment-maintenance-module.md) (proposed).

**Product document**: new `docs/features/equipment-maintenance.md`, created with the first delivery.
Related: [Downtime and incidents](../../docs/features/07-incidents-and-downtime.md),
[Worker bot](../../docs/features/02-activation-and-bot.md), [Admin panel](../../docs/features/11-admin-panel.md).
**Engineering memory**: new `docs/engineering/features/equipment-maintenance.md`, created with the
first delivery. Related: [shift reminders](../../docs/engineering/features/shift-reminders.md),
[multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md).

## RECON: Current Behavior

Facts from the baseline:

- **No equipment entity exists.** `responsibility_zones` (`packages/db/src/schema/org.ts:77`) is
  documented as the "minimal object of responsibility without an equipment directory (ТЗ 1.4)".
  The glossary defines a zone as "a workplace or machine inside a unit". Equipment traces are only
  the reason `BREAKDOWN`, the downtime reason `WAITING_MECHANIC`, the handover remark need `REPAIR`
  and the photo-inspection category `EQUIPMENT_STATE`.
- **Mechanics are employees, not panel users.** The seeded position `MECHANIC` («Наладчик»,
  `packages/db/src/seed-defaults.ts:93`) exists; positions are rows, not an enum. Employees use the
  bot through `telegram_accounts` (one ACTIVE link). Web users (`auth_user`) and employees are
  separate identities with no link.
- **Roles** (`packages/domain/src/access/roles.ts:6`): `PRODUCTION_HEAD, PLANNER, HR, SHIFT_MASTER,
CLEANLINESS_CONTROLLER, ACCOUNTANT, ADMIN, AUDITOR`, each granted with a scope
  (`ENTERPRISE|SITE|ORG_UNIT|TEAM|ZONE`) in `web_user_roles`. Controllers use `@Roles(...)` and
  `scopeCondition`/`assertInScope` (`apps/api/src/common/access-scope.ts`). No maintenance role.
- **Incidents** (`packages/db/src/schema/incidents.ts`, `packages/domain/src/incidents/lifecycle.ts`):
  a worker on an open shift reports a problem (reason, comment/photo, "is work stopped?"). Reports
  attach to an open incident of the same zone and reason. The incident has site/unit/zone, severity
  `NORMAL|CRITICAL|SAFETY`, statuses `REPORTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED`
  (plus `DUPLICATE`, `REJECTED`), a first-response SLA for the master and the diagnosis fields
  "Cause" and "How was it resolved?". SLA breach writes `INCIDENT_SLA_BREACHED` and is visible in the
  panel; it sends no Telegram message. There is no link to a machine.
- **Notifications**: `notification_outbox` rows are written in the business transaction with a
  unique `dedupe_key`; the worker relay sends them to Telegram with retries. Only `EMPLOYEE`
  recipients are delivered; `WEB_USER` rows are skipped.
- **Timers**: durable `background_tasks` rows with deterministic keys, a typed `TimerTask` union
  (`packages/contracts/src/timer-tasks.ts`) and a worker switch. A firing task re-reads committed
  state before acting. Shift reminders already re-check eligibility at delivery and suppress
  reminders during approved absences.
- **Files**: private S3-compatible storage (R2 in production), presigned GET with a 5-minute TTL,
  panel uploads through API multipart limited to 10 MiB; PDF validation exists
  (`apps/api/src/communications/media.service.ts`). The bot receives photos only.
- **Panel**: React 19, TanStack Router (hash history), FSD slices under `apps/admin-web/src`,
  a shared `ResourceCalendar` and period `DateField`/`MonthField` controls.
- **Tenancy**: one database per tenant; product modules are switches in
  `packages/domain/src/tenant/tenant.ts` (`TenantModule`); per-tenant parameters live in `settings`.

## SPEC: Outcome and Boundaries

### Outcome

The chief mechanic keeps a register of the plant's machines. Each machine carries its manuals and
one or more maintenance plans taken from those manuals. Every plan names its operations, the
materials, parts and tools to have on hand, and the responsible mechanic. The system turns each
plan into dated maintenance work, shows it in a calendar, reminds the responsible mechanic in
Telegram 7, 3 and 1 day before, lets the mechanic perform and report the work in the bot, and lets
the chief mechanic accept it, which dates the next cycle. A breakdown reported on a machine
becomes an emergency repair assigned to that machine's mechanic with an acknowledgement deadline
and escalation, and the machine returns to service only by an explicit release.

### Scope

Five user stories, delivered in three independently verifiable deliveries (see [plan.md](plan.md)):

1. Equipment register and manuals (US1, US2).
2. Maintenance plans, maintenance work, calendar, reminders and execution (US3–US6).
3. Emergency repair (US7).

### Non-goals

Taken from TZ-M but deferred to later bounded changes:

- Warehouse stock, reservations, issue/return, purchase requests and a spare-part catalogue with
  compatibility rules (TZ-M §21–22, §39–53). Here a plan lists what is needed as text with
  quantity and unit, and the mechanic confirms readiness; nothing counts stock.
- Photo or OCR part recognition (TZ-M §54–62).
- Meter-hour and cycle-based plans with meter epochs, unless decision D-1 says otherwise (TZ-M §18.3, §24).
- Nodes, installation positions and installed-part history (TZ-M §39–49).
- Numeric measurements with tolerances, instruments and calibration in checklists (TZ-M §20);
  operations here are answered done / not done / not applicable.
- Calendar windows with resource capacity, stop segments by cause, availability and MTBF reports
  (TZ-M §23, §25).
- Automatic in-product search or download of manuals, and AI extraction of intervals from a manual
  ([research.md](research.md) R3). AI does not set maintenance norms.
- Crediting an emergency repair against a maintenance plan (TZ-M §19); an emergency repair never
  moves a plan's due date in this change.
- Bulk CSV import of equipment; a pilot of about 20 machines is entered by hand.
- Any change to the shift FSM, activity intervals or bonus. Doing maintenance or repair does not
  change the mechanic's shift state (C3); an operator's `DOWNTIME` keeps its existing behavior.

### Compatibility

- Existing incidents, downtime reports and their SLA keep their behavior. Emergency repair adds an
  optional machine link and a separate mechanic work item; an incident without a machine behaves as
  today.
- The feature is a tenant module (`MAINTENANCE`), off by default. Tenants without it see no new
  menu, bot button or job.

### Assumptions

- **A-1**: A mechanic is an active employee whose current position performs maintenance. The
  existing `MECHANIC` position is marked so by default; the administrator can mark other positions.
- **A-2**: The responsible mechanic has a linked Telegram account. If not, reminders cannot be
  delivered and the panel says so (FR-043).
- **A-3**: The master of a machine's unit is `org_units.master_employee_id`, an employee who can
  receive Telegram escalations. Panel users (chief mechanic, production head) see escalations in the
  panel only, because the outbox delivers to employees only.
- **A-4**: Reminder offsets default to 7, 3 and 1 day and are sent at 09:00 in the site's time zone.
  Both are tenant settings.
- **A-5**: Dates of calendar plans are site-local business dates (ADR-0005). "Overdue" starts when
  the due date has passed in the site's time zone without accepted completion.
- **A-6**: Manuals are PDF files up to 50 MiB, which is also Telegram's upload limit for bots.
- **A-7**: Pilot data (machine list, manuals, intervals) is supplied by the plant; the system does
  not invent intervals, and a plan without a source cannot be published (FR-022).

### Open decisions

These change behavior; the rest of the spec is written for the recommended option.

- **D-1 Meter hours.** Many manuals say "every 250 h or 3 months, whichever comes first".
  Recommended: this change supports calendar intervals only; the calendar branch of such a rule is
  entered now, and meter-hour plans with manual readings follow in a separate change. Alternative:
  include meter readings now (adds readings, epochs and forecast dates; reminders 7/3/1 days before
  an hour threshold can only be forecasts).
- **D-2 Who manages maintenance in the panel.** Recommended: a new panel role `CHIEF_MECHANIC`
  («Головний механік», scoped like other roles) manages equipment, manuals and plans, accepts
  maintenance and releases machines; `ADMIN` can do the same; `SHIFT_MASTER` sees equipment in scope,
  creates emergency repairs and releases a machine after an emergency repair in their unit.
  Alternative: no new role, give these rights to `SHIFT_MASTER` and `ADMIN`.
- **D-3 Who closes planned maintenance.** Recommended (TZ-M R06, §15): the mechanic submits the work
  and `CHIEF_MECHANIC` (or `ADMIN`) accepts it; the next cycle is dated from the performed date.
  Alternative: the mechanic's "Done" completes the work immediately and the chief mechanic can only
  reopen it.

## User Scenarios and Testing

### US1: Equipment register (Priority: P1)

The chief mechanic registers each machine once with its location, passport data, criticality and a
responsible mechanic, so every later plan, reminder and repair has an owner.

**Acceptance scenarios**:

- **AC-001**: Given the maintenance module is on and I am `CHIEF_MECHANIC` for site S, when I add a
  machine with code, name, unit, responsible mechanic and criticality, then it appears in the
  equipment list of S with state "Available" and the audit log records who created it.
- **AC-002**: Given a machine with code `M01` exists, when anyone saves another machine with code
  `m01 ` (case and spaces differ), then saving is rejected with an inline "code already used" error
  and the draft stays filled.
- **AC-003**: Given an employee is not in a maintenance position, blocked or terminated, when I pick
  the responsible mechanic, then that employee is not offered and the API rejects a forged request.
- **AC-004**: Given a `SHIFT_MASTER` scoped to unit A, when they open the equipment list or request a
  machine of unit B by id, then unit B's machines are neither listed nor returned (404-equivalent,
  no details leaked).
- **AC-005**: Given a machine with open maintenance or repair work, when I archive it, then archiving
  is refused with the list of open work; given no open work, archiving hides it from new plans and
  pickers and keeps its history.
- **AC-006**: Given I change the responsible mechanic of a machine, when I save, then I choose whether
  open planned work moves to the new mechanic (default: yes); moved work notifies the new mechanic
  once and future reminders go to them.

### US2: Manuals attached to a machine (Priority: P1)

The chief mechanic downloads the manufacturer manual and attaches it to the machine with its source,
so the mechanic and the plan refer to the same document.

**Acceptance scenarios**:

- **AC-007**: Given a machine, when I upload a PDF with title, kind, language, edition and source
  URL, then the document is listed on the machine with who attached it and when, and opening it
  shows the file through a short-lived link.
- **AC-008**: Given a file that is not a valid PDF or exceeds the size limit, when I upload it, then
  the upload is rejected with the reason and no document row remains.
- **AC-009**: Given five identical machines, when I attach an existing document to the other four,
  then one stored file is linked to all five.
- **AC-010**: Given a document referenced by a plan, when I remove it from the machine, then it is
  archived, not deleted: the plan and completed work still show and open it.
- **AC-011**: Given I am the responsible mechanic of a maintenance work item, when I press
  "Інструкція" in the bot, then the bot sends me the manual file with the plan's page/section in the
  caption; given the file cannot be sent, the bot says so and the error is recorded.

### US3: Maintenance plan from the manual (Priority: P1)

The chief mechanic turns the manual's maintenance table into plans: what to do, how often, from which
source, what to have on hand and who does it.

**Acceptance scenarios**:

- **AC-012**: Given a machine, when I create a plan with title, interval "every 3 months", source
  (document and page/section), operations, a materials list and a first due date, and press
  "Publish", then the plan is active and exactly one maintenance work item exists for the first due
  date, assigned to the machine's responsible mechanic.
- **AC-013**: Given a draft without a source, interval, operation, responsible mechanic or first due
  date, when I press "Publish", then publishing is refused and each missing field shows an inline
  error; saving the draft is allowed and creates no work or reminders.
- **AC-014**: Given the plan's history is unknown, when I publish, then I must enter the first due
  date explicitly; the system never invents a "last performed" record.
- **AC-015**: Given an active plan with open work, when I edit and publish the plan, then a new plan
  version is created; the open work keeps its original operations and materials unless I explicitly
  apply the new version to it after seeing the differences.
- **AC-016**: Given two plans of one machine (monthly and yearly), when one is completed, then the
  other's due date does not change.
- **AC-017**: Given an active plan, when I pause it with a reason, then no new work is generated and
  existing open work stays; resuming does not extend the interval, and an already passed due date
  creates one overdue work item.
- **AC-018**: Given a plan, when I copy it to another machine, then a draft is created that inherits
  operations and materials but not the due date, source validity or responsible mechanic, which I
  must confirm before publishing.

### US4: Maintenance calendar (Priority: P1)

The chief mechanic, masters and planners see what maintenance is due when, on which machine, by whom
and whether it is ready, so they can align it with production.

**Acceptance scenarios**:

- **AC-019**: Given active plans, when I open Maintenance → Calendar for a month, then every
  maintenance work item planned in that month is shown on its planned date with machine code, plan
  title, mechanic and a status shown in text or icon, not by colour alone.
- **AC-020**: Given an active plan, when I look at months after its next work item, then projected
  occurrences are shown with a distinct "forecast" marker and cannot be opened as work.
- **AC-021**: Given filters for site, unit, mechanic, machine and status, when I change them, then
  the calendar and its count below show only matching items, and filters persist in the URL.
- **AC-022**: Given a work item past its due date without accepted completion, when I view the
  calendar, then it is marked "Overdue" with icon and text; an emergency repair open on the same
  machine is shown separately and does not hide the overdue mark.
- **AC-023**: Given I have the right to plan, when I move a work item to another date with a reason,
  then its planned date changes, its due date and any overdue fact remain, reminders are re-planned
  for the new date and the mechanic receives one "date changed" notice.
- **AC-024**: Given a phone-width screen, when I open the calendar, then it shows an agenda list by
  day with the same information and actions, without horizontal page scroll.
- **AC-025**: Given the responsible mechanic has an approved absence covering the planned date, when
  I view the item, then it shows a warning with the absence and a quick action to reassign.

### US5: Telegram reminders to the responsible mechanic (Priority: P1)

The mechanic learns in time what maintenance is coming and what to prepare.

**Acceptance scenarios**:

- **AC-026**: Given a work item planned for 10 October at site time zone Europe/Kyiv, when 3, 7 and
  9 October 09:00 local arrive, then the responsible mechanic receives one reminder each with machine,
  location, plan title, planned date, estimated duration, whether the machine must stop, the operation
  list, the materials list with quantities and units, and buttons "Відкрити", "Інструкція",
  "Все є" and "Чогось бракує".
- **AC-027**: Given the worker or relay repeats a reminder task or delivery, when it runs again, then
  the mechanic receives at most one message per work item, planned date and offset.
- **AC-028**: Given a work item is created or re-planned 2 days before its date, when that happens,
  then the mechanic receives one "new maintenance" notice now and only the 1-day reminder later;
  skipped offsets are not sent late.
- **AC-029**: Given the work was completed, cancelled, reassigned or re-planned before a reminder
  fires, when the reminder task runs, then it sends nothing (or sends to the new mechanic for the
  current date only).
- **AC-030**: Given the mechanic presses "Чогось бракує", when they pick missing items or type a note,
  then the work item's readiness becomes "Missing" with the list, the calendar shows it and the
  unit master receives a Telegram notice; "Все є" sets readiness "Ready". Either answer can be
  changed until the work starts.
- **AC-031**: Given the mechanic has no active Telegram link or has blocked the bot, when a reminder
  is due, then the delivery failure is visible on the work item in the panel and the backup mechanic
  (if set) receives the reminder.
- **AC-032**: Given the mechanic has an approved absence on the planned date, when the 7-day reminder
  fires, then the backup mechanic (or, without one, the unit master) receives a copy marked
  "responsible mechanic absent".

### US6: Performing planned maintenance (Priority: P1)

The mechanic performs the operations and records the result from the phone; the chief mechanic
accepts it and the next cycle is dated.

**Acceptance scenarios**:

- **AC-033**: Given I am a mechanic, when I open "🔧 Мої роботи" in the bot, then I see my open
  maintenance and repair work sorted by planned date, overdue first, each opening a work card.
- **AC-034**: Given an assigned work item, when I press "Почати", then it becomes "In progress" with
  my start time; then each operation asks "Виконано / Не виконано / Не застосовно"; "Не виконано"
  and "Не застосовно" require a reason; an operation marked "photo required" requires a photo.
- **AC-035**: Given all operations are answered and materials used are confirmed or edited, when I
  press "Готово", then the work goes to "Review" with the performed time; given a required operation
  is "Не виконано", then "Готово" is refused and the bot offers "Пауза" with a reason (for example
  "немає матеріалу").
- **AC-036**: Given work in review, when the chief mechanic accepts it in the panel, then it becomes
  "Completed", and for a "from completion" plan the next work item is created for performed date +
  interval; for a "fixed calendar" plan the next grid date after the current due date is used.
- **AC-037**: Given work in review, when the chief mechanic returns it with a comment, then it goes
  back to "In progress", the mechanic is notified and the previous submission stays in history.
- **AC-038**: Given the same "Почати" or "Готово" callback is delivered twice or pressed on an old
  message after the work changed, when it is processed, then it has no second effect and the bot
  shows the current card ("Стан змінився").
- **AC-039**: Given a mechanic without Telegram did the work on paper, when the chief mechanic
  records completion in the panel on the mechanic's behalf, then the work records both the performer
  and who entered it.
- **AC-040**: Given a completed work item, when anyone opens it, then it is read-only and shows the
  plan version, operations with answers, photos, materials used, performer, reviewer and times.

### US7: Emergency repair (Priority: P1)

An operator reports a breakdown on a machine; the machine's mechanic must accept it quickly,
the master sees who works on it, and the machine returns to service only by an explicit release.

**Acceptance scenarios**:

- **AC-041**: Given an operator on an open shift in a zone with machines, when they choose
  "Повідомити про проблему", then after the reason they pick the machine (or "Не знаю / інше");
  when they answer "work stopped: yes", then in one transaction the report and incident are saved
  with the machine, an emergency repair is created for the machine's responsible mechanic, the
  machine state becomes "Stopped" with an open stop episode, and notifications are queued. The
  operator sees the registration number only after the commit.
- **AC-042**: Given an emergency repair, when it is created, then the mechanic receives a Telegram
  message with machine, location, reason, operator comment, photo if any, priority and buttons
  "Прийняти" and "Не можу"; the unit master receives an informational copy.
- **AC-043**: Given priority P1 (stopped) with an acknowledgement budget of 5 minutes, when nobody
  accepts in time, then the backup mechanic and the unit master receive an escalation and the
  panel marks the repair "Not accepted"; after the escalation gap without acceptance, the panel
  escalates to the chief mechanic and production head. A SAFETY reason is P0 and escalates at once.
- **AC-044**: Given the mechanic presses "Не можу" with a reason, when it is saved, then the repair
  is offered to the backup mechanic, the master is notified, and the acknowledgement deadline is
  not reset.
- **AC-045**: Given an accepted repair, when the mechanic records "Почав", "Очікування" with a reason
  (no part, need a specialist, waiting for a window) and "Готово" with what was done, cause, parts
  used and a photo, then each step is timestamped; waiting does not stop the machine's stop episode.
- **AC-046**: Given a finished repair, when the chief mechanic, the unit master or an administrator
  releases the machine as "Available" or "Restricted" with a condition, then the stop episode ends at
  the release time, the machine state changes, the reporting operator is notified and the incident's
  cause and resolution are prefilled from the mechanic's report for the master to resolve as today.
- **AC-047**: Given the machine already has an open stop episode, when another operator reports a
  stop on it, then the report attaches to the existing incident and episode; no second repair or
  episode is created.
- **AC-048**: Given a machine unknown to the operator ("Не знаю / інше"), when they report, then the
  incident is created as today without a machine and without a stop episode; the master can link the
  machine later, which then creates the emergency repair.
- **AC-049**: Given I am `CHIEF_MECHANIC` or `SHIFT_MASTER` in the panel, when I create an emergency
  repair from the machine card (for example reported by phone), then the same repair, notifications
  and stop episode are created, with me recorded as the reporter.
- **AC-050**: Given an emergency repair is open on a machine, when a planned maintenance work item of
  that machine is planned during it, then both remain visible; the planned item keeps its dates
  unless someone re-plans it.

### Edge Cases

- A machine without a responsible mechanic cannot be saved as active (FR-003), so a plan or repair
  always has an owner; a mechanic who is blocked or terminated sends their open work to the chief
  mechanic's reassignment queue and the unit master is notified.
- DST changes: reminders are computed per site-local date at 09:00 local; a skipped or repeated
  local hour still yields exactly one reminder (ADR-0005 helpers).
- A plan interval in months uses calendar months; 31 January + 1 month is the last day of February.
- A plan published with a first due date in the past creates one work item marked overdue at once,
  no reminders in the past.
- Changing the interval of an active plan does not create a fake completion; if the new due date is
  already past, the open or new work item is overdue.
- A machine moved to another unit keeps its history under the old unit; future work and reminders
  follow the new unit's time zone and master.
- A tenant without the `MAINTENANCE` module: no menu, no bot button, no jobs; existing machine data,
  if the module is later switched off, stays and jobs stop without sending.
- Large manual (> 50 MiB): rejected with a clear message; the uploader may attach a smaller edition or
  split the document. The bot never posts a presigned link into Telegram (C7).
- Emergency report while the bot, Redis or Telegram is unavailable: the database transaction decides
  success; notification delivery is retried by the relay and its failure is visible in the panel.
- Two mechanics press "Прийняти" at once: one becomes the lead; the other sees who accepted.

## Requirements

### Functional Requirements

**Module and access**

- **FR-001**: The system MUST provide the maintenance feature as a tenant module `MAINTENANCE`; when
  off, no maintenance route, menu, bot entry or job is active. Verified by AC-001 and the module test.
- **FR-002**: The system MUST enforce permissions per decision D-2 on every API command and bot
  callback, including scope by site/unit, re-checking the actor's current rights on each old button
  press. Verified by AC-004, AC-038.

**Equipment (US1)**

- **FR-003**: A machine MUST have a code unique within the tenant (normalised trim + case-insensitive),
  name, site, unit, criticality (`HIGH|MEDIUM|LOW`), responsible mechanic, and MAY have zone, type,
  manufacturer, model, serial number, year, commissioning date, backup mechanic and notes. Verified
  by AC-001, AC-002.
- **FR-004**: Only active employees in a position marked as maintenance MUST be selectable as
  responsible or backup mechanic, and the backup MUST differ from the responsible mechanic. Verified
  by AC-003.
- **FR-005**: A machine MUST have an operating state `AVAILABLE|RESTRICTED|STOPPED|UNKNOWN` with the
  time and source of the last change, changed only by emergency flow and release (US7) or by an
  explicit, reasoned correction by the chief mechanic. Verified by AC-041, AC-046.
- **FR-006**: Archiving MUST be refused while open work or an open stop episode exists and MUST keep
  all history. Verified by AC-005.
- **FR-007**: Changing the responsible mechanic MUST offer to reassign open planned work and MUST
  notify the new mechanic once per reassigned item. Verified by AC-006.

**Documents (US2)**

- **FR-008**: The system MUST store manuals as private files with title, kind
  (`OPERATING_MANUAL|SERVICE_MANUAL|PARTS_LIST|WIRING_DIAGRAM|OTHER`), language, edition, optional
  source URL (http/https, stored as text, never fetched by the server), size, SHA-256, uploader and
  time. Verified by AC-007.
- **FR-009**: The upload MUST accept only valid PDF files up to the configured limit (default 50 MiB)
  and leave no partial row on failure. Verified by AC-008.
- **FR-010**: One document MUST be linkable to several machines. Verified by AC-009.
- **FR-011**: A document referenced by a plan or completed work MUST NOT be deleted; unlinking archives
  the link and keeps it readable in history. Verified by AC-010.
- **FR-012**: The panel MUST open documents through short-lived presigned links; the bot MUST send the
  file itself to authorised mechanics and MUST NOT log or send presigned URLs (C7). Verified by
  AC-007, AC-011.

**Plans (US3)**

- **FR-020**: A plan MUST belong to one machine and have title, interval (`N` days, weeks or months),
  anchor mode (`FROM_COMPLETION` default, or `FIXED_CALENDAR`), first due date, source (document with
  page/section, or "plant decision" with author and note), estimated duration, "machine must stop"
  flag, responsible mechanic (default: machine's), an ordered list of operations (text, optional
  place, photo-required flag) and a materials list (kind `PART|MATERIAL|TOOL`, name, optional
  article/part number, quantity > 0, unit, "every cycle" or "if needed"). Verified by AC-012.
- **FR-021**: Plans MUST have states `DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED`. A draft MUST NOT create
  work or reminders. Verified by AC-013, AC-017.
- **FR-022**: Publishing MUST validate all required fields and show errors per field. Verified by
  AC-013, AC-014.
- **FR-023**: Editing an active plan MUST create a new version; work items MUST keep a snapshot of the
  version they were created from; applying a new version to open work MUST be an explicit action
  after a diff. Verified by AC-015.
- **FR-024**: The system MUST keep at most one open work item per plan cycle (unique plan + cycle
  key) and MUST create the next one only on acceptance of the current one (US6), or at publish/resume
  for the first/overdue one. Repeated jobs or commands MUST return the same work item. Verified by
  AC-012, AC-016, AC-017.
- **FR-025**: Plans of one machine MUST be independent. Verified by AC-016.
- **FR-026**: Copying a plan MUST create a draft on the target machine without due date and
  responsible mechanic. Verified by AC-018.

**Work items and calendar (US4)**

- **FR-030**: A maintenance work item MUST store due date (from the plan rule; changed only by an
  explicit correction with reason), planned date (default = due date; re-plannable with reason),
  assignee, plan version snapshot, status and readiness (`UNKNOWN|READY|MISSING`). Verified by
  AC-012, AC-023.
- **FR-031**: The panel MUST show a month and week calendar and a phone agenda of work items with
  filters for site, unit, mechanic, machine and status, a total count, and URL-persisted filters,
  using the shared calendar/period controls. Verified by AC-019, AC-021, AC-024.
- **FR-032**: The calendar MUST show projected future occurrences of active plans as forecasts that
  are not work items. Verified by AC-020.
- **FR-033**: Overdue, readiness "Missing", absent mechanic and open emergency repair MUST each be
  distinguishable by text or icon plus a hue not reused for another meaning on the screen. Verified by
  AC-022, AC-025, AC-030.
- **FR-034**: Re-planning MUST keep the due date and overdue fact, re-plan reminders and notify the
  assignee once. Verified by AC-023.

**Reminders (US5)**

- **FR-040**: For each open maintenance work item the system MUST schedule reminders at the configured
  offsets (default 7, 3, 1 days) before the planned date at the configured local time (default
  09:00 site time), as durable tasks keyed by work item, planned date and offset. Verified by AC-026,
  AC-027.
- **FR-041**: Offsets already in the past at creation or re-planning MUST be skipped and replaced by
  one immediate notice. Verified by AC-028.
- **FR-042**: A firing reminder MUST re-read the work item and send nothing if it is no longer open,
  planned for that date or assigned to that mechanic. Verified by AC-029.
- **FR-043**: Delivery failures MUST be visible on the work item; the backup mechanic MUST receive the
  reminder when the responsible mechanic cannot be reached or has an approved absence on the planned
  date, and the unit master when there is no backup. Verified by AC-031, AC-032.
- **FR-044**: The reminder MUST contain the machine, location, plan title, date, duration, stop flag,
  operations, materials with quantities, and actions to open the card, get the manual and answer
  readiness; readiness "Missing" MUST notify the unit master. Verified by AC-026, AC-030.

**Execution (US6)**

- **FR-050**: Work status MUST follow `ASSIGNED → IN_PROGRESS ⇄ WAITING → IN_REVIEW → COMPLETED`, with
  `IN_REVIEW → IN_PROGRESS` on return and `CANCELLED` from any non-final status with a reason; each
  transition records actor, time and reason where required, as a pure domain transition table.
  Verified by AC-034–AC-037.
- **FR-051**: Submission MUST require an answer for every operation, a reason for "not done" and "not
  applicable", required photos, and confirmed materials used; a required operation "not done" MUST
  block submission. Verified by AC-034, AC-035.
- **FR-052**: Acceptance MUST date the next cycle from the performed time (`FROM_COMPLETION`) or the
  next grid date after the due date (`FIXED_CALENDAR`); missed grid dates stay recorded as missed.
  Verified by AC-036.
- **FR-053**: Every mutating bot callback and API command MUST be idempotent and version-checked; a
  stale action MUST return the current card. Verified by AC-038.
- **FR-054**: The chief mechanic MUST be able to record completion on behalf of a mechanic, recording
  both people. Verified by AC-039.
- **FR-055**: Completed and cancelled work MUST render read-only with its full evidence. Verified by
  AC-040.

**Emergency repair (US7)**

- **FR-060**: A downtime report or incident MAY reference a machine; when the reporting zone has active
  machines the bot MUST ask for the machine after the reason, with a "don't know / other" option.
  Verified by AC-041, AC-048.
- **FR-061**: A report on a known machine with "work stopped" or a critical/safety reason MUST, in one
  transaction, save the report and incident, create or reuse the machine's open emergency repair,
  open or reuse the machine's single stop episode, set the machine state and queue notifications.
  Verified by AC-041, AC-047.
- **FR-062**: Emergency priority MUST be derived as P0 (safety reason), P1 (work stopped), P2 (fault
  without stop), with acknowledgement budgets from tenant settings (defaults 2, 5, 30 minutes) and an
  escalation gap (default 5 minutes). Verified by AC-043.
- **FR-063**: Missing acknowledgement MUST escalate to the backup mechanic and unit master by Telegram
  and, after the gap, to the panel for chief mechanic and production head; "can't do" MUST re-offer
  the repair without resetting the deadline. Verified by AC-043, AC-044.
- **FR-064**: Emergency repair steps MUST record accepted, started, waiting intervals with reasons,
  and finished times separately; the stop episode MUST continue during waiting. Verified by AC-045.
- **FR-065**: Only a release by an authorised person MUST end the stop episode and change the machine
  state; completing the repair alone MUST NOT make the machine available. Verified by AC-046.
- **FR-066**: The panel MUST allow authorised users to create an emergency repair from a machine card.
  Verified by AC-049.
- **FR-067**: Existing incident behavior (first-response SLA, statuses, diagnosis) MUST remain
  unchanged for incidents with and without a machine. Verified by existing incident tests and AC-046.

**History, audit and i18n**

- **FR-070**: Every create/update/archive of machines, documents and plans MUST write `audit_log`;
  every work and machine-state transition MUST append a `domain_events` entry (C6). Verified by AC-001
  and domain/integration tests.
- **FR-071**: All user-facing text in the panel and bot MUST exist in `uk`, `en` and `ru`; non-obvious
  controls MUST have i18n tooltips. Verified by the i18n catalog test.

### Key Entities

Detailed fields and constraints: [data-model.md](data-model.md).

- **Equipment**: a physical machine in a unit (optionally a zone) with passport data, criticality,
  responsible and backup mechanic, operating state and archive date.
- **Equipment document**: a stored manual file with source metadata; linked to one or more machines.
- **Maintenance plan / plan version**: the recurring rule and its versioned content (operations,
  materials, source, assignee).
- **Work item**: one unit of maintenance or repair work with type (`PLANNED_MAINTENANCE`,
  `EMERGENCY_REPAIR`), priority (`P0–P3`), status, due/planned dates, assignee, snapshot, answers,
  materials used and history. Acceptance, release and readiness are facts, not statuses (TZ-M §14).
- **Stop episode**: the continuous period a machine is unavailable, at most one open per machine
  (TZ-M R02); ends only by release.
- **Maintenance reminder**: a durable timer task per work item, planned date and offset, and its
  outbox notification.

## Success Criteria

- **SC-001**: For every active plan in the pilot, the calendar shows the next work item and the
  mechanic received the 7/3/1-day reminders exactly once each (AC-026, AC-027).
- **SC-002**: No maintenance work item or emergency repair exists without a named responsible person
  (FR-003, FR-004, FR-061).
- **SC-003**: Completing a work cycle dates the next one without manual edits, and independent plans
  never shift each other (AC-016, AC-036).
- **SC-004**: An emergency report on a machine reaches its mechanic, escalates when unanswered and
  cannot make the machine available without a release (AC-041–AC-046).
- **SC-005**: The chief mechanic can answer "what maintenance is due next week, on which machines,
  by whom and is it ready" from one calendar view (AC-019, AC-030).

## Verification Scope

Classification under `docs/engineering/testing-baseline.md`: new behavior with **transactions,
migrations, access and failure recovery** — the high-risk row. Required:

- Pure domain tests: work status transitions, next due date rules (months, end of month, fixed grid,
  missed cycles), reminder schedule computation (offsets, skipped past offsets, DST), emergency
  priority and escalation deadlines.
- Integration tests on real PostgreSQL: unique plan cycle under concurrent job runs, one open stop
  episode per machine under concurrent reports, idempotent reminders and callbacks, scope isolation
  of equipment/documents/work across units, document upload rollback.
- Bot harness tests: reminder keyboard and callbacks, execution flow, stale callbacks, no close or
  release button for mechanics in the bot, emergency accept/can't-do.
- Panel component tests for the calendar view model and plan form validation.
- One independent review of the migration, access checks and emergency transaction.
- Visual QA (desktop and mobile screenshots) of the equipment list and card, plan form, calendar and
  work card; live bot QA of reminder and emergency flows with the QA account per
  `docs/runbooks/product-qa.md`.
