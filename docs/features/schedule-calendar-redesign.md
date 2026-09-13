# Schedule calendar redesign

Status: **planned feature; not implemented**. Owner: product owner. Recorded: 2026-09-12.
Authority: consolidate the calendar research, ranked 50-feature catalog and desktop/mobile UX review
into a separate feature for the complete redesign of the Schedule page. This request authorizes
documentation; it does not claim implementation or approve unresolved operating policies.

**Support boundary:** this document describes future behavior. Do not tell employees that these new
capabilities are available. [Current Schedule behavior](05-schedule.md) remains the operational guide
until individual capabilities ship. [Engineering plan, evidence and remaining work](../engineering/features/schedule-calendar-redesign.md)
track implementation. This document is the single product requirements source for this redesign.

The [Deputy and When I Work deep research](../research/2026-09-12-deputy-wheniwork-calendar-deep-research.md)
provides the detailed functional comparison, public-code/API analysis, desktop/mobile illustrations,
manufacturing implications and ten implementation clarifications. It distinguishes documented
competitor behavior from proposed Vakhta policy. Use it with the visual gallery below; the canonical
50-capability scope and unresolved policy gates remain in this feature and its engineering plan.

## Outcome

Replace the Schedule page with a coherent calendar workspace for planning shifts, understanding team
coverage, handling exceptions and communicating published decisions. Administrators, planners and
masters should spend less time reconstructing the situation from separate lists and asking people
for information already held by Vakhta.

The owner permits substantial UX experimentation while the product is being tested. Preserve shift
and schedule creation, standard day/night templates, rotations, batch assignment, review, publication,
history and employee communication. Existing data and working attendance processes remain meaningful.
A new calendar presentation is not a second independent schedule or permission to discard history.

Expected benefits are hypotheses: faster planning and replacement, fewer repeated corrections,
clearer responsibility and fewer unnoticed communication gaps. No measured time saving, production
throughput or equipment downtime improvement is claimed.

## Actors and proposed authority

| Actor                | Intended job                                                                            | Authority boundary                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Administrator        | Configure scheduling, prepare and publish plans, resolve exceptional cases              | Explicit site/unit/zone scope and audited commands                                                                              |
| Planner              | Build periods, repeat cycles, resolve validation problems, submit for review            | Preparing a plan does not grant publication or attendance correction rights                                                     |
| Production head      | Review coverage, approve/reject publication and permitted exceptions                    | Preserve existing review responsibility                                                                                         |
| Shift master         | See their team, recognize problems, request or prepare replacements from context        | Current Schedule access is read-only. Proposed scoped preparation requires a policy decision; direct publication is not assumed |
| Employee             | Read personal published plan, acknowledge updates, request changes and express interest | Own data only; acknowledging information is not consenting to additional work                                                   |
| HR and other readers | Review permitted absence context or read schedules                                      | Preserve existing request routes and field-level privacy; calendar access does not expose medical documents                     |

Recommended initial master policy: allow a scoped proposal and submission to the existing approver.
Record the owner decision before implementing new write permissions. A role-specific initial view
does not itself grant new authority.

## Terms and source of truth

- **Schedule:** a versioned plan for a period and organizational scope; publication determines the
  employee-facing plan. A calendar is a presentation of this plan.
- **Shift template:** reusable local start/end times and day/night identity.
- **Assignment:** a person's planned shift, with time, business date, zone and required metadata.
- **Staffing requirement:** the defined number and qualifications of people needed for a time/zone/role.
- **Open slot:** one concrete unfilled requirement that can receive a qualified person. It is not an
  employee assignment with a fake identity.
- **Segment:** a planned part of one person's shift in a zone. Segment count is not employee count.
- **Availability preference:** a person's preferred working times, separate from approved absence.
- **Actual shift:** the recorded operational shift and its events, governed by existing attendance
  and shift workflows. Changing a plan does not rewrite actual work or prove physical presence.

Publication, notification queueing, delivery where observable, acknowledgement and presence are
separate states. Display unavailable evidence as unknown, never as successful completion.

## Scope and preservation contract

The target redesign includes SC-01 through SC-45 and SC-50, delivered incrementally after their
specific data and policy dependencies are resolved. Existing capabilities count as preservation and
integration work, not reasons to rebuild reliable services. Advanced features are later milestones;
the first release is not completion of the entire target.

SC-46 through SC-49 remain explicitly gated extensions: workload forecasting, cost/pay models and
external HR/payroll integrations exceed the current MVP. Their inclusion preserves the complete
research catalog; they require a separate scope decision before implementation. SC-45 starts with
rule-based suggestions reviewed by a person, with no autonomous AI decisions.

The existing template-based create/edit, cycle generation, batch preview, undo/redo, draft recovery,
review/publication, version history, bot plan and reminders must still work after the redesign.
Do not make micro-scheduling or custom fields mandatory for a standard shift.

Native mobile apps, a new chat system, equipment/OEE/order tracking, payroll execution, biometrics and
a replacement attendance/FSM engine are outside this feature. The mobile target is the responsive
Vakhta web panel, with the existing Telegram employee experience integrated where relevant.

## Ranked functional catalog: exactly 50 capabilities

Stable IDs retain the original ranking. Manufacturing value considers readiness, safe staffing,
frequency, affected people and avoidable manual work. It is an expert estimate, not a measured score;
rank is not implementation order. Permissions, history, privacy and transaction integrity are mandatory
regardless of rank.

Baseline labels: **Preserve** = existing main scenario; **Extend** = partial capability or separate
workflow; **New** = absent from the researched calendar scenario. Totals: **7 Preserve, 19 Extend,
24 New**. These describe the inspected baseline, not deployment readiness or complete competitor parity.
Each row defines a target acceptance check; all also inherit the cross-cutting criteria below.

### Readiness and safe staffing — SC-01 to SC-10

| ID / rank | Capability and required behavior                                             | Manufacturing value                            | Baseline | Acceptance check                                                                                                                              |
| --------- | ---------------------------------------------------------------------------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-01     | Staffing requirements by zone, date/time and role; show missing coverage     | Exposes an unstaffable shift early             | New      | With four required and three eligible assigned people, show one vacancy; missing norms show unknown, not sufficient                           |
| SC-02     | Replacement candidates with availability, hours and reasons                  | Reduces manual search and contacts             | New      | Candidate selection explains eligibility and revalidates it at commit; stale candidates cannot create conflicts                               |
| SC-03     | Approved and pending absences overlaid on the calendar                       | Avoids relying on unavailable people           | Extend   | An approved absence covering the relevant business date is visible; pending/rejected states stay distinct and private attachments stay hidden |
| SC-04     | Role requirements, competencies and expiring qualifications                  | Protects professional coverage and safety      | New      | A missing/expired required qualification blocks assignment under the approved policy; unknown qualification data is explicit                  |
| SC-05     | Assignment overlap detection across units and midnight                       | Prevents impossible simultaneous work          | New      | Overlapping active plans are rejected even when submitted concurrently; adjacent non-overlapping intervals remain valid                       |
| SC-06     | Rest and consecutive-shift rules                                             | Prevents planned overload                      | New      | Versioned configured limits produce actionable reasons at preview and commit, including overnight transitions                                 |
| SC-07     | Current plan alongside attendance and data freshness                         | Helps the master recognize an emerging problem | Extend   | Scheduled, acknowledged, started and unknown-presence states differ; missing QR evidence is not a proven no-show                              |
| SC-08     | Notifications for published additions, moves, replacements and cancellations | Reduces use of outdated plans                  | Preserve | Only affected recipients are admitted to existing notification delivery; queueing is not labelled delivery                                    |
| SC-09     | Draft preparation, exact diff, review and publication                        | Keeps incomplete edits away from workers       | Preserve | Draft edits remain unpublished; the permitted approver sees additions/removals/changes and affected people before publication                 |
| SC-10     | Scoped master proposals and permitted scheduling actions                     | Reduces waiting for routine decisions          | Extend   | The accepted authority matrix is enforced server-side; a master cannot alter another zone or publish without an explicit grant                |

### Daily coordination — SC-11 to SC-20

| ID / rank | Capability and required behavior                                           | Manufacturing value                           | Baseline | Acceptance check                                                                                                                  |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SC-11     | Create, move, reassign or cancel a future assignment; change template/zone | Supports daily staffing decisions             | Extend   | A context-created shift inherits the selected date/person/zone; edits preserve all untouched metadata and show their scope        |
| SC-12     | Calendar grouped by zones and roles, with day/night teams                  | Makes the relevant team easy to find          | Extend   | A master can open a zone/date and read its complete team; empty active zones remain visible                                       |
| SC-13     | Employee shift swaps with counterpart and managerial approval              | Coordinates two related changes               | Extend   | Both assignments change atomically through the existing request route; rejection changes neither                                  |
| SC-14     | Handle urgent absence, lateness and early-leave reports from context       | Shortens the path from report to decision     | Extend   | The action opens the correct request workflow and coverage impact; it cannot silently correct attendance                          |
| SC-15     | Concrete open slots with time, zone and role                               | Makes unfilled work actionable                | New      | A slot can exist without a person, fills once, and is counted separately from assigned people and requirements                    |
| SC-16     | Offer slots to eligible people, collect interest, approve selection        | Replaces repeated individual outreach         | New      | Interest does not assign the slot; the authorized decision selects one candidate and preserves other responses/history            |
| SC-17     | Planned hours, configured limits and additional-work approvals             | Exposes overload before assignment            | Extend   | Totals show units and the chosen period; exceeding a configured limit follows the approved blocking/approval policy               |
| SC-18     | Acknowledgement of the relevant published changes and reminders            | Exposes communication gaps                    | Extend   | An acknowledgement refers to the relevant publication/change; obsolete acknowledgement cannot confirm a new assignment            |
| SC-19     | Version history, authors, reasons and changes                              | Preserves accountability and dispute evidence | Preserve | Historical versions and decisions are read-only; navigation reveals actor/time/reason without replacing original evidence         |
| SC-20     | Employee personal plan and pre-shift reminders in Telegram                 | Reduces routine questions to the master       | Preserve | The bot reflects published time/zone, suppresses superseded or absence-covered reminders and does not expose other people's plans |

### Fast and dependable planning — SC-21 to SC-30

| ID / rank | Capability and required behavior                                         | Manufacturing value                         | Baseline | Acceptance check                                                                                                                         |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| SC-21     | Employee calendar with weekly/monthly workload summaries                 | Simplifies individual planning              | Extend   | Switching from zone to employee grouping preserves the period and uses the same assignments                                              |
| SC-22     | Day, week, fortnight and month, including month boundaries               | Supports both current operations and cycles | Extend   | A week spanning two months shows all dates; writes identify every affected version and never partially apply without an explicit outcome |
| SC-23     | Complete roster search and filters for people, zones, roles and problems | Avoids hidden candidates and long searches  | Extend   | Search can find an authorized employee beyond the first 200; totals, pagination and failures are accurate                                |
| SC-24     | Reusable standard shift templates, including day/night                   | Eliminates repeated time entry              | Preserve | A standard shift remains creatable from a template; historical times remain stable when templates change                                 |
| SC-25     | Repeating assignments and work/rest rotations                            | Accelerates regular scheduling              | Preserve | A selected range follows a chosen cycle and anchor; fill-empty and replace have explicit, different previews                             |
| SC-26     | Copy periods and save/load schedule patterns                             | Reuses recurring staffing arrangements      | Extend   | Copy maps source to target dates, exposes absences/inactive entities/conflicts and does not publish automatically                        |
| SC-27     | Batch assignment and editing across selected dates/people                | Removes repetitive individual actions       | Extend   | Preview gives exact additions/removals/changes; filters do not silently narrow or erase unrelated assignments                            |
| SC-28     | Undo/redo local draft actions                                            | Makes mistakes recoverable                  | Preserve | Undo/redo restores assignment data, including zone and metadata; it never rolls back a published decision                                |
| SC-29     | Persisted drafts and concurrent-editor protection                        | Prevents lost planning work                 | Extend   | Reload restores a user-scoped draft; a stale server revision is rejected while retaining the local draft for reconciliation              |
| SC-30     | Mobile master calendar with readable teams and contextual actions        | Supports decisions on the shop floor        | Extend   | The primary day view works at 390px without page-level horizontal scrolling; create/replace/review remain usable with touch and keyboard |

### Process-dependent capabilities — SC-31 to SC-40

| ID / rank | Capability and required behavior                                       | Manufacturing value                               | Baseline | Acceptance check                                                                                                                     |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SC-31     | Drag assignments between people/dates/zones                            | Speeds frequent small moves                       | New      | Drag and the explicit Move action invoke equivalent validation/preview; invalid drops leave the plan unchanged                       |
| SC-32     | Assignment-specific start/end times beyond templates                   | Supports partial and exceptional shifts           | New      | A custom time retains template provenance, handles next-day end times and reaches reminders/attendance planning consistently         |
| SC-33     | One-off and recurring employee availability/preferences                | Reduces unsuitable offers                         | New      | Preferences stay distinct from approved leave; recurrence, scope and exceptions have explicit dates and timezone                     |
| SC-34     | Decide absence requests with calendar coverage context                 | Removes manual cross-checking                     | Extend   | Only the current permitted approval step is actionable; request and all affected schedule changes remain atomic                      |
| SC-35     | Distribution of night, weekend and additional shifts                   | Makes uneven burden visible                       | New      | Comparisons state period and eligible cohort, respect agreements and do not present a fairness score as an objective verdict         |
| SC-36     | Planned breaks and relief coverage                                     | Supports continuity during breaks                 | New      | Planned relief is included in staffing calculations; planned breaks never rewrite actual break events                                |
| SC-37     | Segments across zones within one shift; explicit split/link operations | Coordinates movement and temporary reinforcement  | New      | The full shift and each segment are identifiable; split/link previews preserve duration and explain every affected person/zone       |
| SC-38     | Borrow qualified available workers from other units                    | Expands the replacement pool                      | New      | Source unit and its staffing impact are visible to authorized users; both scopes and the agreed approval route are checked at commit |
| SC-39     | Shift notes and planning-relevant calendar events                      | Keeps relevant instructions at the decision point | New      | Notes have clear audience and visibility; long text cannot stretch the page or disclose restricted information                       |
| SC-40     | Links to related checklists, handovers and operational records         | Reduces pre-shift information search              | Extend   | A link opens the correct permitted record; the calendar does not duplicate checklist or handover completion logic                    |

### Later capabilities and separately gated extensions — SC-41 to SC-50

| ID / rank | Capability and required behavior                      | Manufacturing value                               | Baseline | Acceptance check                                                                                                                             |
| --------- | ----------------------------------------------------- | ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-41     | Retrospective planned-versus-actual deviations        | Improves future plans using recorded evidence     | Extend   | Reports distinguish planned time, recorded work and unknown departure; they do not infer OEE or employee fault                               |
| SC-42     | Printable schedules by zones or people                | Provides a usable shop-floor reference            | New      | Print includes period, timezone, publication identity and creation time; unpublished output is clearly marked                                |
| SC-43     | Export authorized assignments and summaries           | Removes manual spreadsheet transcription          | New      | Export uses the requested complete scope and states filters/version/units; it does not expose hidden records or execute spreadsheet formulas |
| SC-44     | Personal calendar subscription                        | Helps employees coordinate personal and work time | New      | Only the employee's published assignments are exposed; access is revocable, updates retain identity and sync delay is explained              |
| SC-45     | Rule-based proposed assignment of existing open slots | Saves planning effort at scale                    | New      | A person reviews an explainable diff; infeasible slots remain explicit and no automatic publication or AI decision occurs                    |
| SC-46     | Convert workload forecasts into staffing demand       | Supports variable demand                          | New      | **Separate scope approval:** define input quality and approved norms; missing workload data never becomes invented demand                    |
| SC-47     | Budget planned labor costs                            | Supports cost comparison                          | New      | **Separate scope approval:** version rates/rules, currencies and access; estimates are not payroll calculations                              |
| SC-48     | Compare planned and actual labor costs                | Explains financial deviations                     | New      | **Separate scope approval:** comparable approved inputs expose missing/unapproved actuals instead of misleading totals                       |
| SC-49     | HR/payroll system exchange                            | Reduces duplicate administration                  | New      | **Separate scope approval:** identify the actual system, contract, owner, reconciliation and retry behavior before integration               |
| SC-50     | Additional typed shift fields for demonstrated needs  | Supports specific local processes                 | New      | Each field has a defined meaning/type/audience; historical values remain interpretable and standard shifts need no unnecessary input         |

Raise SC-36/37 priority if actual shop-floor observation confirms frequent relief/zone movement.
Raise SC-24/25/26 priority for stable repetitive crews. Raise printing priority when devices are
unavailable. Changes to rank must retain IDs and document the reason.

## Required user journeys

1. **Build a standard schedule:** select scope/period → create an empty plan or copy a pattern →
   choose workers and day/night template or rotation → review exceptions and exact diff → save draft →
   submit → authorized review/publication → show notification admission and acknowledgement state.
2. **Resolve a staffing gap:** open a zone/day → inspect required/assigned roles and missing people →
   open a slot → inspect candidates and reasons → propose/approve replacement → revalidate and publish
   through the appropriate route → track the affected worker's response.
3. **Handle an absence or swap:** open the contextual request → inspect the affected shifts and
   coverage → follow counterpart/master/head/HR steps as applicable → atomically save the decision
   and schedule effects → notify through the existing channel.
4. **Handle a partial shift:** select the assignment → edit custom time or zone segments → review the
   full before/after timeline, breaks and affected coverage → validate → save/review/publish.
   Editing a segment must never silently delete the full shift.
5. **Work from a phone:** choose a date on the week strip → read the day's people/problems → open
   relevant details → perform one permitted action → see explicit success or retain input after failure.
6. **Recover from concurrent work:** edit a saved baseline → another editor changes it → attempt save →
   see a conflict with preserved local work → reconcile against the new baseline → review and resubmit.

## Desktop and mobile UX requirements

One workspace exposes date navigation, Today, period scale, grouping, scope, search and relevant
filters. Creation and publication are separate actions with explicit meanings. Proposed defaults:
planners see a week by people; masters see today by zone. Remember a user's selected view within the
permitted scope. Versions belong in history, while the current published plan remains obvious.

| Priority | Required design decision                                                                        | Associated capabilities    |
| -------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| UX-01    | Show actionable staffing gaps with the rule/input used; unknown demand stays unknown            | SC-01, SC-12, SC-15        |
| UX-02    | Distinguish plan, acknowledgement and recorded presence without merging their statuses          | SC-07, SC-18, SC-20        |
| UX-03    | Place Find replacement near the affected assignment/open slot                                   | SC-02, SC-14, SC-16        |
| UX-04    | Publication review identifies exact changes, affected people and notification consequences      | SC-08, SC-09               |
| UX-05    | Mobile uses a week date strip and readable day list; a dense matrix is secondary                | SC-22, SC-30               |
| UX-06    | Create from date/person/zone context with visible, correct defaults                             | SC-11, SC-24               |
| UX-07    | Keep standard creation short; disclose segments, custom time and optional details progressively | SC-24, SC-32, SC-37, SC-50 |
| UX-08    | People and zone views share assignments, period and meaningful selection                        | SC-12, SC-21               |
| UX-09    | Explicitly label whole shift versus segment and preview adjacent changes                        | SC-32, SC-36, SC-37        |
| UX-10    | Supplement semantic color with text/icon/pattern; avoid an arbitrary color legend               | SC-03, SC-09, SC-12        |
| UX-11    | Use 24-hour time, duration units and an explicit end date for overnight work                    | SC-17, SC-22, SC-32        |
| UX-12    | Explain a relevant blocked action without exposing data outside the actor's permissions         | SC-04, SC-06, SC-10, SC-17 |
| UX-13    | Provide keyboard/touch alternatives to drag and hover-only actions                              | SC-11, SC-30, SC-31        |
| UX-14    | Preserve input, selection and reading position through refresh and recoverable failure          | SC-23, SC-29, SC-30        |
| UX-15    | Preview batch/copy effects, including removals and exceptions, before applying                  | SC-25, SC-26, SC-27        |

For desktop tables, expand existing-record details under the owning row using shared reading/editing
surfaces. For mobile cards, keep details next to their parent. Creation may use a dialog/full-width
form. Do not copy competing Save/Save & Publish buttons with equal emphasis or nested modal stacks.
Use one primary action per stage with a clear result. Do not turn all 50 capabilities into permanent
toolbar buttons. Use existing shared controls, loaders and feedback; no new page-specific design system.

## Cross-cutting acceptance criteria

- **AC-01 — Preservation:** standard creation, templates, rotation, batch diff, undo/redo, draft
  recovery, review, publication, history and employee plan remain available with unchanged meaning.
- **AC-02 — Truth:** requirements, open slots, assignments, segments and actual events have distinct
  counts and labels. Neither absent data nor stale data produce a false readiness/success state.
- **AC-03 — Authority/privacy:** each read and command checks actor/scope/operation and allowed fields;
  eligibility search cannot leak another unit's medical or personnel details.
- **AC-04 — Atomicity:** assignment validation, required request decisions, version changes, audit
  evidence and durable notification intent cannot partially commit. Cross-month changes have an explicit
  transaction boundary. External delivery is independently recoverable.
- **AC-05 — Concurrency:** overlapping assignments, competing slot claims and stale editor saves are
  protected on the server, not only by a preview. Retrying an operation cannot duplicate its effect.
- **AC-06 — History:** publication supersedes versions; changes to the plan never overwrite recorded
  attendance, shift FSM history, append-only audit or events. Started/completed work follows existing
  correction rules instead of ordinary future-plan editing.
- **AC-07 — Time:** business date, site timezone, midnight, month/year boundaries, DST, partial shifts
  and break accounting are explicit. Rules are versioned configuration, not invented statutory limits.
- **AC-08 — Recovery:** distinguish initial loading, refresh, offline/paused, failure, empty success
  and saving. Keep cached data and unsaved input; expose retry/conflict recovery without silent mutation retries.
- **AC-09 — Usability:** desktop/mobile, keyboard/focus, touch targets and long translated data are
  checked. Actions with no effect are natively disabled and guarded. Counts cover complete filtered results.
- **AC-10 — Communication:** no draft sends employee schedule-change notifications. Publication
  reports queue admission honestly, suppresses obsolete reminders and binds acknowledgement to current information.
- **AC-11 — Evaluation:** compare the same planning/replacement/recovery tasks against the baseline;
  record task time, corrections and assistance needed. No productivity claim without corresponding evidence.

## Milestones and completion

Implement foundations and preserve existing workflows before enabling capabilities dependent on new
rules. [The technical task map](../engineering/features/schedule-calendar-redesign.md#implementation-backlog)
assigns every SC ID to a delivery stream, dependencies and verification. A milestone can ship without
claiming all 50 are done. The complete target requires SC-01–45 and SC-50 plus all applicable AC/UX
criteria; SC-46–49 stay explicitly deferred until separately approved. Record shipped IDs and any
accepted scope changes rather than leaving a partial implementation labelled complete.

Before dependent implementation, settle master authority, staffing/qualification ownership, rule
severity, segment/break semantics and cross-month publication behavior. Other independent work may
continue. These are policy questions to resolve in the feature plan, not a request to approve this
documentation again.

## Visual references: real Deputy and When I Work interfaces

These seven screenshots are part of the redesign brief. Use them when designing the calendar and
reviewing the implementation, alongside the SC/UX requirements above. They show competitor interfaces,
not implemented Vakhta screens or final Vakhta mockups. Red arrows are annotations from the original
help articles. Images are embedded from official documentation hosts; each has an original-size link.

### 1. Deputy: schedule grouped by areas

The selected location and week appear above the calendar. Areas form groups, dates form columns,
and cards show employee names and working times. This example is filtered to Ben; it does not show
the location's complete staffing. Deputy's Area is a reference for Vakhta's zone view, not an exact
equivalent of a Vakhta organizational unit.

**Apply to Vakhta:** a unit's calendar grouped by its zones, with understandable team coverage and
contextual creation. Requirements: SC-12, UX-01, UX-06, UX-08.

![Deputy weekly schedule grouped by areas, filtered to employee Ben Figuro](https://help.deputy.com/hc/article_attachments/10710923539855)

[Open original screenshot](https://help.deputy.com/hc/article_attachments/10710923539855).

### 2. When I Work: team schedule grouped by employees

Each employee has a row; each date has a column. Shift cards occupy the cells. OpenShifts appear
above the employee rows, with filtering controls to the left of the calendar.

**Apply to Vakhta:** a readable employee/week overview, a visible place for unfilled slots and
independent period/grouping controls. Requirements: SC-15, SC-21, SC-23, UX-08.

![When I Work weekly team schedule with employee rows and an OpenShifts row](https://d1fc5y2qmnxpnr.cloudfront.net/assets/Scheduler-reference-1024x648.png)

[Open original screenshot](https://d1fc5y2qmnxpnr.cloudfront.net/assets/Scheduler-reference-1024x648.png).

### 3. Deputy: one employee's schedule

Ben appears in one row. Monday's 08:00–16:00 card says "3 areas", representing one shift with work
in multiple areas. Other cards show an individual area's name.

**Apply to Vakhta:** switch between zone and employee views of the same assignments. Make a whole
shift and its segments explicit so their counts and editing consequences cannot be confused.
Requirements: SC-21, SC-37, UX-08, UX-09.

![Deputy employee week showing one shift across three areas and other single-area shifts](https://help.deputy.com/hc/article_attachments/10710946238991)

[Open original screenshot](https://help.deputy.com/hc/article_attachments/10710946238991).

### 4. Deputy: create a shift from the calendar

The creation editor retains the calendar behind it and presents employee, date, time, area, break
and note fields. Add area expands the shift's work plan. Save is the primary action in this editor;
publication remains a separate workflow step.

**Apply to Vakhta:** start from a date/person/zone context and prefill those fields. Keep a standard
day/night shift short to create, with additional fields disclosed when needed. Requirements:
SC-11, SC-24, UX-06, UX-07. Follow Vakhta's own dialog/detail conventions rather than copying the overlay.

![Deputy shift creation editor with employee, time, area, break, note and Save action](https://help.deputy.com/hc/article_attachments/10617419782031)

[Open original screenshot](https://help.deputy.com/hc/article_attachments/10617419782031).

### 5. Deputy: edit working times and areas within a shift

The expanded editor shows an overall shift interval and separate area intervals. A time field offers
a dropdown while the remaining fields retain their context.

**Apply to Vakhta:** provide exact time input and a readable segment sequence. Preview any effect on
adjacent segments before committing. Requirements: SC-32, SC-37, UX-09, UX-11, UX-13.

![Deputy detailed shift editor with separate area intervals and a time dropdown](https://help.deputy.com/hc/article_attachments/10617407757839)

[Open original screenshot](https://help.deputy.com/hc/article_attachments/10617407757839).

### 6. When I Work: edit an unfilled shift

The Edit OpenShift form includes time, position, breaks, pickup approval and sharing with other
schedules. Save and Save & Publish expose different outcomes in the footer.

**Apply to Vakhta:** show the role and approval requirements of an open slot, with contextual access
to candidates. Distinguish saving from publication and emphasize one primary action for the current
stage. Requirements: SC-09, SC-15, SC-16, SC-38, UX-03, UX-04.

![When I Work OpenShift editor with sharing, pickup approval, breaks and save/publication actions](https://d1fc5y2qmnxpnr.cloudfront.net/assets/share-with-other-schedules-web-932x1024.png)

[Open original screenshot](https://d1fc5y2qmnxpnr.cloudfront.net/assets/share-with-other-schedules-web-932x1024.png).

### 7. Deputy: create a shift on a phone

The mobile form stacks employee, date, total time, areas and breaks vertically, with a prominent
Add shift action at the bottom. This is a native-app reference, not evidence of responsive-web behavior.

**Apply to Vakhta:** a phone-specific vertical creation flow with readable labels and a reachable
primary action. The responsive web panel must preserve input and remain usable with the on-screen
keyboard. Requirements: SC-30, UX-05, UX-07, UX-14.

![Deputy mobile shift creation form with area intervals and a bottom Add shift button](https://help.deputy.com/hc/article_attachments/13447468620175)

[Open original screenshot](https://help.deputy.com/hc/article_attachments/13447468620175).

Source guides: [Deputy micro-scheduling](https://help.deputy.com/hc/en-au/articles/10611651590159-Managing-micro-scheduled-shifts-and-timesheets),
[When I Work Scheduler](https://help.wheniwork.com/articles/scheduler-reference-guide-computer/) and
[When I Work Labor Sharing](https://help.wheniwork.com/articles/labor-sharing-reference-guide/).

## Research provenance

This consolidates the Deputy/When I Work research and UI review performed in this conversation on
2026-09-12. The ranking, manufacturing adaptation and proposed Vakhta behavior are our design
recommendations, not promises of identical functionality in either competitor. Official screenshots
were visually reviewed; authenticated accounts, native devices, screen readers and competitor
performance were not tested. The gallery above embeds the selected screenshots; additional sources,
observations and tradeoffs live in the engineering document.

### Saved-version spreadsheet output (2026-09-13)

Open a version in Schedule history and choose **Download XLSX**. The file includes the complete saved
version, all assignment statuses, original planned times and version/timezone metadata. It excludes
local draft edits and calendar filters; recorded planned duration is not actual work. Employee names
follow directory access rights. If the saved revision changed, refresh the version before downloading.
Print, notes and operational reports remain separate roadmap work.
