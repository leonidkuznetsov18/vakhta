# Vakhta: product vision and domain brief

Status: living document, owned by the project owner. Revised 2026-09-13.

This is the single source of truth for what Vakhta is, which market category it belongs to, the
vocabulary the team and AI agents use, and the outcomes we optimise for. Requirements stay in the
customer's spec "ТЗ MVP v1.0"; the architecture in `architecture-and-plan.md`; current behaviour per
feature in `features/`; engineering decisions in `engineering/features/` and `adr/`. When this document
and the code disagree about behaviour, the code and the feature docs win; when they disagree about
vocabulary or intent, this document wins and the code should be brought in line.

## 1. Executive summary

Vakhta (Ukrainian «Вахта»: a shift, a watch) is a **Connected Worker & Frontline Operations Platform**
for continuous (24/7) production sites that run rotating 12-hour shifts.

The system digitises the working day of frontline staff, takes unplanned downtime out of the blind
spot, makes shift handover transparent and accountable, and produces labour metrics and bonus scores
from recorded facts instead of recollection.

One backend, two kinds of surface:

- **Mobile-first for workers.** A Telegram bot (`@vakhta_worker_bot`) and QR terminals (the kiosk) at
  the checkpoint. Nothing to install, no account to create, no training beyond "press the button under
  the last message".
- **Enterprise web panel** for shift masters, planners, production management, HR, cleanliness
  controllers, accounting and auditors: live operations, schedule, incidents, handover disputes,
  requests, bonus, reports, audit and administration.

## 2. Market category

Vakhta belongs to the category analysts call **Connected Worker Platforms (CWP)** or **Frontline
Operations Platforms** (Gartner "Market Guide for Connected Worker Solutions", LNS Research
"Connected Frontline Workforce"). The category exists to digitise frontline workflows, reduce
downtime, minimise incidents and close the loop between the shop floor and management.

Where Vakhta sits inside the category:

| Capability                                                | Vakhta MVP                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Attendance and time on site                               | Yes: dynamic gate QR, presence contour, planned vs actual hours        |
| Shift execution and time accounting                       | Yes: shift state machine, activity intervals, timers, corrections      |
| Downtime and incident escalation                          | Yes: reason codes, SLA per severity, escalation to the master          |
| Digital checklists and inspections                        | Yes: position-bound checklists, photo evidence, photo quality pipeline |
| Shift handover                                            | Yes: report, acceptance by the next shift, disputes, master decisions  |
| Workforce requests                                        | Yes: vacation, day off, sick leave, shift swap, extra shift, appeal    |
| Performance and motivation                                | Yes: deterministic, versioned bonus rules with an audit trail          |
| Reporting and audit                                       | Yes: six MVP reports, append-only events and audit log                 |
| Orders, output, OEE, equipment                            | No (out of MVP scope)                                                  |
| Payroll, ERP/MES/access-control, biometrics, AI decisions | No (out of MVP scope)                                                  |

Reference products worth studying (for patterns, not for copying): Parsable (mobile guided work and
digital work instructions), Redzone (social workforce experience, downtime analytics), SafetyCulture
/ iAuditor (photo inspections, checklist authoring, issue categories).

## 3. Who uses it

| Actor                       | Surface   | Role code                | What they do                                                                          |
| --------------------------- | --------- | ------------------------ | ------------------------------------------------------------------------------------- |
| Worker (frontline employee) | Telegram  | linked employee          | Check in by QR, run the shift, report problems, clean, hand over, request, see scores |
| Shift master                | Panel+bot | `SHIFT_MASTER`           | Live shift screen, master transitions with a comment, incidents, handover decisions   |
| Planner                     | Panel     | `PLANNER`                | Monthly schedule versions, staffing demand, publication                               |
| Production head             | Panel     | `PRODUCTION_HEAD`        | Publishes schedules, approves overtime and requests, reads reports                    |
| HR                          | Panel     | `HR`                     | Employee cards, activation codes, sick leave and medical documents                    |
| Cleanliness controller      | Panel     | `CLEANLINESS_CONTROLLER` | Checklists, photo review, handover quality                                            |
| Accountant                  | Panel     | `ACCOUNTANT`             | Closed bonus periods, exports                                                         |
| Auditor                     | Panel     | `AUDITOR`                | Read-only access to events and the audit log                                          |
| Administrator               | Panel     | `ADMIN`                  | Users, roles, directories, terminals, checklists                                      |

Every panel role carries a scope: `ENTERPRISE`, `SITE`, `ORG_UNIT`, `TEAM` or `ZONE`. Access
boundaries are correctness requirements, not UI conveniences.

## 4. Domain glossary

Use these terms in code identifiers, specifications, commit messages and conversations. Codes of
states, actions, reasons and statuses are `UPPER_SNAKE_CASE`, exactly as in the spec and the domain
package.

### Organisation and locations

- **Site.** A plant or production location with its own IANA time zone and terminals.
- **Unit (org unit).** An organisational group of employees inside a site, for example "Shop 1" or
  "Service team". Schedules are planned per unit and month.
- **Zone.** A workplace or machine inside a unit. Shifts, handover and inspections are bound to a zone.
- **Position.** The employee's job role. Checklists are bound to positions and refined by zone type.
- **Terminal (kiosk).** A tablet at a checkpoint that shows a rotating QR code and is paired with a
  one-time code from the panel.

### Workforce and shift time

- **Schedule version.** A monthly plan for a unit with the lifecycle
  `DRAFT → IN_REVIEW → PUBLISHED → SUPERSEDED`; publication notifies employees and asks for acknowledgement.
- **Presence check-in (gate QR).** The employee scans the dynamic QR at the terminal; the bot records
  arrival or departure. Arrival is attached to the published shift whose window contains the instant.
- **Shift session.** The period of actual work, normally a 12-hour day (08:00–20:00) or night
  (20:00–08:00) shift. The business date of a night shift is the date it started.
- **Shift FSM.** The finite state machine in `packages/domain/shift-fsm`. Resumable states:
  `PREPARATION`, `WORKING`, `CLEANING`, `HANDOVER`. Temporary states (exactly one may be open):
  `BREAK`, `MEAL`, `SERVICE_TIME`, `DOWNTIME`. Then `READY_TO_CLOSE` and the terminal states
  `SHIFT_CLOSED` and `EMERGENCY_EXIT`. `NOT_STARTED` exists only between check-in and "Start shift".
- **Activity interval.** A contiguous slice of a shift with one time category (`WORK`, `PREPARATION`,
  `SERVICE`, `BREAK`, `MEAL`, `DOWNTIME`). An open shift has exactly one open interval; the database
  enforces non-overlap.
- **Timers.** Delayed jobs that remind the employee (break, meal, service time, cleaning) and escalate
  downtime. Timers remind but never close a state.
- **Append-only event log.** `domain_events` and `audit_log` are never updated or deleted. A fix is a
  **compensating event** (`SHIFT_CORRECTED`) that references the corrected event; projections such as
  `shift_summaries` are recomputed.
- **Correction.** A master proposal (`MOVE_BOUNDARY`, `RECLASSIFY`, `CLOSE_SHIFT_AT`) applied to
  intervals through the domain with invariant checks.
- **Estimated closure.** When the exit QR is missing, the end-of-day job closes the shift at the planned
  end (`AUTO_CLOSE`) and marks the physical departure as unknown for reconciliation.

### Downtime and incidents

- **Unplanned downtime.** Equipment stopped or work impeded by a breakdown, missing material or a
  safety issue. Two linked things: the employee's personal `DOWNTIME` interval and the zone
  **incident** the master works on.
- **Downtime report.** The employee's "Report a problem" flow: reason, comment, optional photo, and
  the question "Is work stopped?". Reports for the same zone and reason inside the duplicate window
  attach to the open incident.
- **Reason codes directory.** The normalised classifier of reasons (`DOWNTIME`, `HANDOVER`,
  `ADJUSTMENT` kinds) with severity, comment and photo requirements.
- **Incident escalation SLA.** A response timer per severity. If the master has not reacted in time,
  the worker writes `INCIDENT_SLA_BREACHED`; safety reasons escalate immediately. A personal downtime
  that lasts too long writes `DOWNTIME_ESCALATED`.
- **Incident lifecycle.** Acknowledge, take into work, resolve, close, reject or mark duplicate, per the
  transition table in the domain. Resolving an incident does not end the employee's personal downtime.

### Handover and inspection

- **Digital checklist.** An ordered list of `CHECK`, `NOTE` and `PHOTO` items bound to a position,
  with at least one photo item. A position without a checklist skips the report.
- **Handover report.** The outgoing employee's evidence of the zone state: checks with ✅ or ⚠️,
  remarks with a category and safety assessment, a message to the next shift, photos per item.
  Submitting it performs `SUBMIT_HANDOVER`; the outgoing employee does not wait for the receiver.
- **Acceptance.** The incoming shift accepts the zone without remarks or opens a **dispute** with a
  category, a comment and a new photo. Overdue acceptances escalate to the master without penalising
  the outgoing employee; the master records a formal decision.
- **Photo inspection pipeline.** The worker downloads each photo to private storage, computes SHA-256,
  dimensions, brightness and pHash, and flags `LOW_RES`, `DARK`, `CORRUPT` or `DUPLICATE_SUSPECT`
  without an automatic penalty. AI inspection against the checklist's expected objects is an assist for
  the reviewer, never an automatic decision.

### Motivation and accounting

- **Deterministic bonus rules.** A pure function evaluates a shift from recorded inputs (summary,
  presence, intervals, events, incidents, handover, approved requests) against a versioned rule set,
  storing the result with an input hash. The same inputs always give the same score.
- **Rule invariant.** Downtime and safety reports never reduce the bonus. The score falls only for
  incomplete paperwork or discipline violations. A dispute or a suspicious photo sends the criterion
  to review instead of penalising automatically.
- **Manual adjustment.** A reasoned, audited change by a master; large reductions need a second
  approval. Closing a period pins the rule version and freezes scores.
- **Request.** Vacation, day off, sick leave, shift swap, extra shift, minute corrections and bonus
  appeal, each with a decision route and deadlines. Approved schedule changes publish a new version.

## 5. Core principles for agents

1. **Telegram is a transport and UI layer, not the system.** Every button is a command with an
   idempotency key (`tg:<update_id>`) and an expected version. A stale button returns
   `VERSION_CONFLICT` and the current screen; nothing breaks.
2. **One source of truth.** PostgreSQL plus the pure FSM in `@vakhta/domain` decide every state.
   Nobody writes `activity_intervals` outside the transition transaction. An employee never closes a
   shift with a button: the shift closes after the handover report by the exit QR, by the master with a
   comment, or by the end-of-day job.
3. **Auditability.** Master actions, medical document views, exports, permission changes and
   corrections are written to `audit_log` with before/after where relevant.
4. **Timers remind, never close.** Recovery after a crash re-reads the state and stays silent if the
   situation has changed.
5. **Time is stored in UTC** and rendered in the site time zone.
6. **Trilingual by construction.** Every user-facing string lives in `packages/i18n` in `uk`, `en` and
   `ru`; the bot follows the employee, the panel the header, the kiosk the URL or browser.
7. **Access boundaries are correctness.** Role and scope checks live on the server and are tested.

## 6. Value proposition and KPIs

When designing a feature or talking to a plant, we aim at these outcomes.

| KPI                           | Target             | What in Vakhta moves it                                                        |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| Worker adoption               | above 95 percent   | The messenger they already have, one button per step, no training              |
| Time to action on downtime    | minutes, not hours | Instant notification to the master, SLA escalation, personal downtime tracking |
| Handover friction             | fewer disputes     | Mandatory photo checklists, acceptance by the next shift, evidence in disputes |
| Timesheet and bonus accuracy  | no manual disputes | Facts from intervals and events, deterministic rules, audited adjustments      |
| Deployment time at a new site | days, not months   | Seeded directories, kiosk pairing, activation codes, no worker accounts        |

Product direction, in the owner's words: build medicine, not vitamins. A report that a machine stood
idle for two hours is a vitamin. A message to the master thirty seconds after the stop, an escalation to
the production head after five minutes, and a hint from past incidents is medicine. The three levers:

1. **Time to action.** Shorten the path from problem to reaction.
2. **Deterministic gamification.** The worker sees a transparent score with no room for manipulation and
   no penalty for reporting a problem.
3. **Zero-friction entry.** The messenger as the mobile interface keeps training close to zero.

## 7. Domain background

The category rests on three bodies of work. Agents and team members should recognise these ideas in
the requirements.

- **Operator 4.0 and Industry 5.0.** Technology augments the frontline worker rather than replacing
  them (human-in-the-loop, cyber-physical human systems). Value on the shop floor comes from
  people's knowledge, decision speed and safety, not only from machines. Search IEEE Transactions on
  Industrial Informatics for "Operator 4.0", "Cyber-Physical Human Systems" and "Human-in-the-Loop
  Smart Manufacturing".
- **High-Reliability Organizations.** Karl E. Weick and Kathleen M. Sutcliffe, _Managing the
  Unexpected: Sustained Performance in a Complex World_. Sites with high risk need relentless
  operational awareness. Automatic incident escalation and digital handover control implement this.
- **Lean, TPS and TPM.** Jeffrey Liker, _The Toyota Way_ (standard work, shift handover); Robert
  Hansen, _Overall Equipment Effectiveness_ (downtime is the availability pillar of OEE and converts
  directly into money). _Genba_ ("go and see") becomes real-time checklists and photo inspection.
  _Andon_ (pull the cord when there is a problem) becomes the "Report a problem" button and the SLA
  escalation chain.

Industry reports: Gartner "Market Guide for Connected Worker Solutions" (yearly), LNS Research on
operational excellence and connected frontline workforce.

## 8. Where to look in the repository

- `AGENTS.md`: conventions, code rules, workflow and delivery rules for agents and people.
- `docs/architecture-and-plan.md`: requirements analysis, architecture and the delivery plan.
- `packages/domain/src/shift-fsm`: the pure state machine, intervals, corrections and summaries.
- `docs/features/*.md`: product behaviour per feature, also read by the support assistant.
- `docs/engineering/features/*.md`: technical decisions, evidence and remaining work per feature.
- `docs/adr/`: architecture decision records.
- `.agents/skills/vakhta-lean-review/SKILL.md`: the Lean review applied to designs and worker flows.
