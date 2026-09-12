# Schedule acceptance ledger

Baseline: f66cafc. Status: #5 research/prototype and #9 durable commands accepted and closed; other workflow children remain open.
Canonical meaning: [product source](../../docs/features/schedule-calendar-redesign.md). Full issue
criteria in the live GitHub children supplement each row; original bodies must not be overwritten.
Dates/timings/results are recorded only after actual execution. Prior workspace tests are preserved
historical evidence and are not automatically accepted for this redesign.

## Capability → issue → task → verification

| Capability | Owner | Tasks              | Required observable check                                                                                                                     | Evidence/status                                                                                            |
| ---------- | ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| SC-01      | #11   | T022 / T023 / T024 | With four required and three eligible assigned people, show one vacancy; missing norms show unknown, not sufficient                           | Not yet verified                                                                                           |
| SC-02      | #12   | T025 / T026 / T027 | Candidate selection explains eligibility and revalidates it at commit; stale candidates cannot create conflicts                               | Not yet verified                                                                                           |
| SC-03      | #17   | T040 / T041 / T042 | An approved absence covering the relevant business date is visible; pending/rejected states stay distinct and private attachments stay hidden | Not yet verified                                                                                           |
| SC-04      | #11   | T022 / T023 / T024 | A missing/expired required qualification blocks assignment under the approved policy; unknown qualification data is explicit                  | Not yet verified                                                                                           |
| SC-05      | #12   | T025 / T026 / T027 | Overlapping active plans are rejected even when submitted concurrently; adjacent non-overlapping intervals remain valid                       | Not yet verified                                                                                           |
| SC-06      | #12   | T025 / T026 / T027 | Versioned configured limits produce actionable reasons at preview and commit, including overnight transitions                                 | Not yet verified                                                                                           |
| SC-07      | #17   | T040 / T041 / T042 | Scheduled, acknowledged, started and unknown-presence states differ; missing QR evidence is not a proven no-show                              | Not yet verified                                                                                           |
| SC-08      | #7    | T010 / T011 / T012 | Only affected recipients are admitted to existing notification delivery; queueing is not labelled delivery                                    | Metadata-only recipient fix: domain 8 / API 6 checks; see latest engineering checkpoint                    |
| SC-09      | #7    | T010 / T011 / T012 | Draft edits remain unpublished; the permitted approver sees additions/removals/changes and affected people before publication                 | Local preview + lifecycle evidence; full child reconciliation pending                                      |
| SC-10      | #8    | T016 / T017 / T018 | The accepted authority matrix is enforced server-side; a master cannot alter another zone or publish without an explicit grant                | Not yet verified                                                                                           |
| SC-11      | #6    | T007 / T008 / T009 | A context-created shift inherits the selected date/person/zone; edits preserve all untouched metadata and show their scope                    | Context create + metadata preservation regressions and desktop/390px screenshots                           |
| SC-12      | #6    | T007 / T008 / T009 | A master can open a zone/date and read its complete team; empty active zones remain visible                                                   | Complete zone teams and empty active zones verified in model/UI; full child remains open                   |
| SC-13      | #17   | T040 / T041 / T042 | Both assignments change atomically through the existing request route; rejection changes neither                                              | Not yet verified                                                                                           |
| SC-14      | #17   | T040 / T041 / T042 | The action opens the correct request workflow and coverage impact; it cannot silently correct attendance                                      | Not yet verified                                                                                           |
| SC-15      | #13   | T028 / T029 / T030 | A slot can exist without a person, fills once, and is counted separately from assigned people and requirements                                | Not yet verified                                                                                           |
| SC-16      | #13   | T028 / T029 / T030 | Interest does not assign the slot; the authorized decision selects one candidate and preserves other responses/history                        | Not yet verified                                                                                           |
| SC-17      | #12   | T025 / T026 / T027 | Totals show units and the chosen period; exceeding a configured limit follows the approved blocking/approval policy                           | Not yet verified                                                                                           |
| SC-18      | #7    | T010 / T011 / T012 | An acknowledgement refers to the relevant publication/change; obsolete acknowledgement cannot confirm a new assignment                        | 19 snapshot ACK and 37 reminder/timer checks; see #7 checkpoint                                            |
| SC-19      | #7    | T010 / T011 / T012 | Historical versions and decisions are read-only; navigation reveals actor/time/reason without replacing original evidence                     | Scoped history: 6 DB + 1 HTTP checks; read-only original rows, decisions and inspected desktop/390px Sheet |
| SC-20      | #7    | T010 / T011 / T012 | The bot reflects published time/zone, suppresses superseded or absence-covered reminders and does not expose other people's plans             | Not yet verified                                                                                           |
| SC-21      | #6    | T007 / T008 / T009 | Switching from zone to employee grouping preserves the period and uses the same assignments                                                   | Grouping identity/period regressions and contextual browser QA passed                                      |
| SC-22      | #10   | T019 / T020 / T021 | A week spanning two months shows all dates; writes identify every affected version and never partially apply without an explicit outcome      | Not yet verified                                                                                           |
| SC-23      | #9    | T013 / T014 / T015 | Search can find an authorized employee beyond the first 200; totals, pagination and failures are accurate                                     | #9 closed after CI 34724963401; complete 205-worker roster evidence below                                  |
| SC-24      | #7    | T010 / T011 / T012 | A standard shift remains creatable from a template; historical times remain stable when templates change                                      | Template creation and stored-instant frontend regression passed; integrated acceptance pending             |
| SC-25      | #7    | T010 / T011 / T012 | A selected range follows a chosen cycle and anchor; fill-empty and replace have explicit, different previews                                  | Cycle/fill/replace model regressions passed; integrated acceptance pending                                 |
| SC-26      | #14   | T031 / T032 / T033 | Copy maps source to target dates, exposes absences/inactive entities/conflicts and does not publish automatically                             | Not yet verified                                                                                           |
| SC-27      | #14   | T031 / T032 / T033 | Preview gives exact additions/removals/changes; filters do not silently narrow or erase unrelated assignments                                 | Not yet verified                                                                                           |
| SC-28      | #7    | T010 / T011 / T012 | Undo/redo restores assignment data, including zone and metadata; it never rolls back a published decision                                     | Local undo/redo metadata regressions and browser undo passed                                               |
| SC-29      | #9    | T013 / T014 / T015 | Reload restores a user-scoped draft; a stale server revision is rejected while retaining the local draft for reconciliation                   | #9 closed; stale revision, actor isolation and durable response recovery evidence below                    |
| SC-30      | #6    | T007 / T008 / T009 | The primary day view works at 390px without page-level horizontal scrolling; create/replace/review remain usable with touch and keyboard      | 390px keyboard/pointer evidence; true touch execution blocked by browser capability                        |
| SC-31      | #14   | T031 / T032 / T033 | Drag and the explicit Move action invoke equivalent validation/preview; invalid drops leave the plan unchanged                                | Not yet verified                                                                                           |
| SC-32      | #15   | T034 / T035 / T036 | A custom time retains template provenance, handles next-day end times and reaches reminders/attendance planning consistently                  | Not yet verified                                                                                           |
| SC-33      | #12   | T025 / T026 / T027 | Preferences stay distinct from approved leave; recurrence, scope and exceptions have explicit dates and timezone                              | Not yet verified                                                                                           |
| SC-34      | #17   | T040 / T041 / T042 | Only the current permitted approval step is actionable; request and all affected schedule changes remain atomic                               | Not yet verified                                                                                           |
| SC-35      | #16   | T037 / T038 / T039 | Comparisons state period and eligible cohort, respect agreements and do not present a fairness score as an objective verdict                  | Not yet verified                                                                                           |
| SC-36      | #16   | T037 / T038 / T039 | Planned relief is included in staffing calculations; planned breaks never rewrite actual break events                                         | Not yet verified                                                                                           |
| SC-37      | #15   | T034 / T035 / T036 | The full shift and each segment are identifiable; split/link previews preserve duration and explain every affected person/zone                | Not yet verified                                                                                           |
| SC-38      | #17   | T040 / T041 / T042 | Source unit and its staffing impact are visible to authorized users; both scopes and the agreed approval route are checked at commit          | Not yet verified                                                                                           |
| SC-39      | #18   | T043 / T044 / T045 | Notes have clear audience and visibility; long text cannot stretch the page or disclose restricted information                                | Not yet verified                                                                                           |
| SC-40      | #18   | T043 / T044 / T045 | A link opens the correct permitted record; the calendar does not duplicate checklist or handover completion logic                             | Not yet verified                                                                                           |
| SC-41      | #18   | T043 / T044 / T045 | Reports distinguish planned time, recorded work and unknown departure; they do not infer OEE or employee fault                                | Not yet verified                                                                                           |
| SC-42      | #18   | T043 / T044 / T045 | Print includes period, timezone, publication identity and creation time; unpublished output is clearly marked                                 | Not yet verified                                                                                           |
| SC-43      | #18   | T043 / T044 / T045 | Export uses the requested complete scope and states filters/version/units; it does not expose hidden records or execute spreadsheet formulas  | Not yet verified                                                                                           |
| SC-44      | #19   | T046 / T047 / T048 | Only the employee's published assignments are exposed; access is revocable, updates retain identity and sync delay is explained               | Not yet verified                                                                                           |
| SC-45      | #19   | T046 / T047 / T048 | A person reviews an explainable diff; infeasible slots remain explicit and no automatic publication or AI decision occurs                     | Not yet verified                                                                                           |
| SC-46      | #20   | T049 / T050 / T051 | **Separate scope approval:** define input quality and approved norms; missing workload data never becomes invented demand                     | Decision pending                                                                                           |
| SC-47      | #20   | T049 / T050 / T051 | **Separate scope approval:** version rates/rules, currencies and access; estimates are not payroll calculations                               | Decision pending                                                                                           |
| SC-48      | #20   | T049 / T050 / T051 | **Separate scope approval:** comparable approved inputs expose missing/unapproved actuals instead of misleading totals                        | Decision pending                                                                                           |
| SC-49      | #20   | T049 / T050 / T051 | **Separate scope approval:** identify the actual system, contract, owner, reconciliation and retry behavior before integration                | Decision pending                                                                                           |
| SC-50      | #18   | T043 / T044 / T045 | Each field has a defined meaning/type/audience; historical values remain interpretable and standard shifts need no unnecessary input          | Not yet verified                                                                                           |

## Cross-cutting evidence

| Criteria                 | Required evidence owner                                        | Status                  |
| ------------------------ | -------------------------------------------------------------- | ----------------------- |
| AC-01, AC-06, AC-10      | #7 preservation, #15 migration, #54 integrated journeys        | Pending                 |
| AC-02, AC-07             | #10 time, #11/#12 coverage, #15/#16 segments/relief            | Pending                 |
| AC-03                    | #8/#12/#17 scope and field privacy; all export/feed boundaries | Pending                 |
| AC-04, AC-05             | #9/#10/#12/#13/#17 DB concurrency, receipts and rollback       | Pending                 |
| AC-08                    | #6/#9 draft/offline/uncertain save; #54 mobile recovery        | Pending                 |
| AC-09                    | #5/#6 desktop/390px uk/en/ru screenshots, keyboard and touch   | Pending                 |
| AC-11                    | #4 baseline and #54 actual participant pilot                   | Needs real participants |
| UX-01, UX-03, UX-12      | #11/#12/#13 eligibility and unknown shortage                   | Pending                 |
| UX-02, UX-04             | #7/#17 publication/acknowledgement/presence                    | Pending                 |
| UX-05–08, UX-10/11/13/14 | #5/#6 common resource views/mobile/actions/recovery            | Pending                 |
| UX-09                    | #15/#16 whole-versus-part preview                              | Pending                 |
| UX-15                    | #14 batch/copy/exception diff                                  | Pending                 |

## Twelve integrated scenarios (#54)

| Scenario                                      | Owner       | Evidence/status |
| --------------------------------------------- | ----------- | --------------- |
| Standard day/night creation                   | #6/#7       | Pending         |
| Partial required interval                     | #11/#16     | Pending         |
| Missing/expired qualification                 | #11/#12     | Pending         |
| Individually valid previews conflict together | #12/#14     | Pending         |
| Concurrent replacement selection              | #12/#13/#17 | Pending         |
| Week crosses month/year                       | #10         | Pending         |
| Night shift and DST                           | #10/#15     | Pending         |
| One visible linked part                       | #15         | Pending         |
| Filtered save / breaks omission               | #9/#14/#16  | Pending         |
| Timeout after committed change                | #9          | Pending         |
| Publication commits, delivery fails           | #7          | Pending         |
| Phone/keyboard/weak network                   | #5/#6/#9    | Pending         |

## Pilot/cutover decision

### First rendering increment evidence — 2026-09-13

T004/T006/T007/T008 are implemented. Calendar/grid/planning/workspace: 38 tests passed;
affected ESLint and admin-web build (TypeScript/Compiler included) passed. Synthetic desktop/mobile
screenshots were captured and inspected, including localized Sheets and keyboard focus return.
[The engineering memory](../../docs/engineering/features/schedule-calendar-redesign.md) records
exact scope and limitations. SC-11/12/21/30 have partial local evidence; T009 and full child #6
acceptance remain open. T005 is now complete for its controlled rendering prototype; custom interval/segment inspection,
keyboard Move/conflict, measured constraints and screenshots are recorded in research.md.
No DB concurrency, production operation, human baseline, full SC acceptance or pilot is inferred.

HOLD for full cutover: incremental releases exist, but participant baseline and unit pilot are not accepted. Preserve current operational
Schedule behavior. See planned docs/runbooks/schedule-calendar-rollout.md; automatic local checks
cannot substitute for measured participant tasks or an explicit production pilot decision.

### Complete roster read evidence — #9

T057 is complete: PostgreSQL pages return all 205 workers with exact totals; Schedule rejects
incomplete/changing/nonprogressing pages and aborts obsolete reads. The workspace regression finds
worker 205 through search, applies an assignment and verifies the full-month save retains the hidden
original assignment. Batch pagination counts the complete filtered roster and selects only the shown
page. Desktop/mobile synthetic screenshots are recorded in feature memory. This supplies the roster
read portion of SC-23; expected revisions, uncertain commands, session isolation and full #9 remain
open. Per-page snapshots do not freeze directory changes across the entire multi-request read.

### Stale-write evidence — #9

T058 is complete locally: two concurrent editors produce one committed full-month save and one
409 conflict; the winning assignments and revision agree. Stale submit/return/publish/revise/delete
are rejected under lock. HR removal of planned assignments advances the reviewed version revision.
The panel preserves the rejected draft and original revision, including same-grid revision conflicts,
and blocks no-op lifecycle actions. Legacy API reads/create responses remain visible during deployment
while existing-version writes stay disabled. Evidence and desktop/mobile screenshots are recorded
in feature memory. SC-29 and #9 remain open for actor-isolated persistence and command outcome recovery;
no timeout/idempotency or production acceptance is inferred from these checks.

### Actor-owned recovery evidence — #9

T061 is complete: new drafts are keyed by actor/site/unit/month/version. Unowned legacy bytes remain
stored but are not loaded as the current actor's edits. Overview worker presets also carry their actor.
Reads are partitioned by actor/current grants, and responses require the original workspace generation
and observed Query instance. A→B and warm-cache A→B→A delayed saves cannot clear drafts or announce
success in the new workspace. Workspace regressions (23), planning regressions (8), panel build and
scoped lint pass; desktop/mobile recovery alerts were captured and inspected. The earlier ignored
storage-recovery notice now renders as an actual error. Durable receipts/timeout resolution remain
open. Browser storage is not encrypted and is not a boundary against direct device/storage access.

#5 was closed with the full research/prototype checklist and screenshot comment after integrated
CI 34723539292 succeeded, including release, announcement, images and Pages. It does not close #4
policy decisions, advanced persistence, participant baseline or pilot acceptance.

### Durable outcome evidence — #9

Validated web command receipts now commit atomically with schedule and required effect intent.
Lost responses resolve by the same actor-bound identity, including create and delete; replay checks
current authorization. Panel commands are stored before dispatch and restored after reload without
an automatic retry. Newer local edits are retained. Origin-wide storage locking prevents stale live
stores from erasing other commands; retry rejects a removed/replaced identity. The 34 panel tests,
real-DB command/revision/effect tests, independent review and desktop/mobile recovery screenshots are
recorded in engineering memory. Combined with T057/T058/T061 this covers the implementation criteria
for #9; final CI and GitHub issue reconciliation remain the delivery gate. It does not accept #4
policies, #6's remaining interface criteria, a participant baseline or production pilot.
