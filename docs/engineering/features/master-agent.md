# Master agent: repository-grounded action plan

Status: proposed implementation backlog, 2026-09-12. No application changes or autonomous actions
have been implemented by this planning task. Product scope: [Master agent](../../features/master-agent.md).

## Evidence and readiness

Local baseline: `4195d82632d3f2be00ffcb2fa2a2ece2e5f5bd1f`. Railway reported successful API and worker
deployments at the same commit. Read-only production aggregate queries ran at 13:20-13:21 UTC on
2026-09-12 with statement timeouts. No employee text, medical documents, image bytes or credentials
were exported. Counts include all stored records; production, QA and seeded examples have not been
classified. These are inventory counts, not a validated training/evaluation dataset.

| Stored data                 | Observed amount                                                                                         | Consequence                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Checklist definitions       | 5 active families; 3 with object rules; 9 active catalog objects                                        | Reuse catalog and rules; coverage is incomplete                                        |
| Handovers                   | 42: 6 submitted, 2 draft, 4 accepted, 20 resolved accepted, 4 issue confirmed, 2 no fault, 4 superseded | Existing operational outcomes are coarse labels, not item-level truth                  |
| Attached checklist photos   | 77 attachment rows; all 77 have a storage key and checksum in the database                              | Storage metadata is ready; actual object readability was not tested                    |
| Human photo reviews         | 9: 6 problems, 2 compliant, 1 not assessable; 28 regions; 2 explicit rejected findings                  | Useful seed examples, insufficient coverage for autonomy                               |
| Reference photos            | 1                                                                                                       | Reference selection exists; reference-based analysis does not                          |
| Photo review revisions      | 14, including 8 with editor duration                                                                    | Duration measures editor-open-to-save, not active review effort                        |
| AI runs                     | 23: 12 succeeded, 11 failed, across four prompt versions                                                | Do not pool versions as a quality estimate                                             |
| Current `workplace-v4` runs | 8: 1 succeeded; 4 quota failures; 3 unavailable failures                                                | Provider reliability/budget is an immediate prerequisite; not proof of current outage  |
| AI usefulness feedback      | 3: one helpful, one partial, one not helpful                                                            | Usefulness is not precision/recall                                                     |
| Incidents                   | 33: 30 resolved, 1 closed, 1 rejected, 1 reported; only 2 with both cause and solution                  | No rich repair knowledge base yet; existing history needs curation                     |
| Requests                    | 6 across SICK, LATE, VACATION, TECH_ISSUE, SWAP, APPEAL                                                 | Not enough examples for learned approval policy; several master types have no examples |

These records cover approximately September 6-11, not months of production history.

### Pilot selected from existing data

| Checklist family          | Reports | Distinct attached photos | Saved photo reviews | Reference photos | Active object rules |
| ------------------------- | ------- | ------------------------ | ------------------- | ---------------- | ------------------- |
| Оператор СТ вторая стенка | 10      | 24                       | 7                   | 1                | 4, all with notes   |
| Оператор СТ первая стенка | 23      | 34                       | 1                   | 0                | None                |
| Пакувальник СТ            | 6       | 15                       | 0                   | 0                | 2                   |
| Чек-ліст Вибиральника     | 2       | 2                        | 1                   | 0                | 7                   |
| Чек-ліст Водія            | 1       | 1                        | 0                   | 0                | None                |

Start with **Оператор СТ вторая стенка** (family `2ae0184a-4419-47b8-9e0c-2d9c7a5ecd1b`): it has the
best available combination of rules and labels, despite not having the most reports. Curate its 24
photos and 10 reports first, then collect fresh reports. The former suggestion to begin with 100-200
existing labeled reports did not match actual inventory. Do not manufacture that sample size.

## What exists, what it does, and what is missing

### 1. Checklist data and deterministic checks: reuse

`packages/db/src/schema/handover.ts` stores versioned definitions, CHECK/NOTE/PHOTO items, answers,
remarks, `safeToWork`, requested assistance, inability-to-complete reasons, attachments, deadlines,
legacy receiving-shift reviews and master resolutions. `validateHandoverDraft` in
`packages/domain/src/handover/checklist.ts` already checks completeness. Its `cannotComplete` exception
intentionally permits missing items/photos; the agent must escalate that case, not reject submission.

Missing: a report-level assessment linking every relevant item to evidence and a policy. Missing-data
checks should use existing pure rules, not another LLM implementation. Raw ACCEPTED/NO_FAULT/RESOLVED
outcomes must remain distinct in evaluation even when the UI groups them under Approved.

### 2. Photo inspection: extend instead of replace

`photo_inspections`, revisions, runs, feedback, `photo_objects` and `checklist_photo_rules` already
separate human truth, predictions and editable rules. `PhotoInspectionService.analyze` admits a manual
run and durable task transactionally, uses configured quotas and snapshots object names/notes.
The existing worker uses leases, checksums, image normalization, retries and runtime validation.

The actual `gemma.ts` prompt detects only listed prohibited objects. It does not receive worker
answers, inability-to-complete reasons, master decisions or reference images. `InspectionContext`
contains metadata/checklist labels, but the model request sends a tile plus an object instruction.
There is no report-level reviewer or incident/request analyzer.

Concrete changes required before reusing predictions operationally:

- `toPrediction` can return COMPLIANT when some tiles are unreadable; its tests explicitly allow one
  unreadable tile out of four. Optional `image_quality`, default empty findings and dropped malformed
  boxes can also lose information. Add explicit coverage/partial/invalid states; never promote those
  paths to report approval. Distinguish no listed object detected from all requirements satisfied.
- One photo currently costs `4 tiles * 3 rounds * object count` successful model calls, before retries.
  For the chosen family this is 48 per photo and 144 per complete three-photo report. The one successful
  v4 run reports 48 calls. Current `usage.calls` omits failed attempts. Track attempted calls, known
  usage and unknown usage separately; bound admission by projected cost as well as run count.
- The runner processes one photo at a time per worker; automatic backlog must not starve manual work
  or time-critical tasks. Bound concurrency and reserve manual capacity. Measure service time/backlog
  before increasing workers or changing the tile/voting algorithm.
- Make model/prompt selection one versioned source; identifiers currently appear in both contracts and
  worker implementation. Compare cheaper analysis strategies on the same examples before replacement.
- Automatic admission must not fabricate a WebUser or human review: factor the reusable transactional
  analysis admission out of `PhotoInspectionService`, with an explicitly scoped system principal and
  distinct initiation metadata. Preserve the existing manual endpoint and source identity rules.

### 3. Photo requirements and references: add an explicit contract

Current rules are one prohibited-object list per checklist family, shared across zones and versions;
this was a deliberate simplification. Preserve this default and do not restore zone-specific forms.
Add a separate versioned review policy referencing the existing list. For each exact PHOTO item it can
state required visible area, review criteria and explicitly selected reference inspection revisions.

`isReference` is currently a human-review flag, not a unique approved reference binding. Use immutable
inspection revision IDs and checksum-backed media identity, not the latest mutable review or signed URL.
Photo keys are generated from item order in `ChecklistsService.toItems`; `ITEM_02` can mean something
else after reordering. Initially bind requirements/references to `definitionId + itemKey`, require an
explicit mapping when publishing a new definition version and test reordered/removed items. Do not
reuse family-plus-key references blindly or change the existing Telegram callback keys incidentally.

Snapshot policy, reference revision and full object list at review admission. Historical records lack a
complete historical policy snapshot: backfilled analysis must say it is retrospective under a named
policy, not pretend to reproduce the rules in force at original submission.

### 4. Permissions: repair before agent context retrieval

`WebAuthGuard` checks role membership, not target scope. `canActOn`/`grantCovers` already implement a
same-grant role-and-scope check and are used by photo inspection. Reuse them consistently:

- Incidents list/detail/stats and mutations do not receive grants; query filters are not authorization.
- Handover list has partial unit filtering, but SITE grants become unrestricted; detail and resolve do
  not receive grants. Reports without zones need an explicit ownership rule instead of disappearing.
- Requests retain only role names in `Decider`; inbox filters approval steps but not organizational
  scope, and detail/decide similarly lack grant-based target checking.
- Generic `MediaService.link` signs a media ID without checking its owning incident/handover/request.
  The photo-inspection wrapper does check ownership, but generic media endpoints need equivalent gates.
- SSE streams are global in-process subjects: filter scope or omit business identifiers; they are not
  a durable work queue. Exports, reference retrieval and historical search need the same scope gates.

Use explicit typed access context at the service boundary for humans and the agent. Resolve target
site/unit/zone/team from the owning record and authoritative assignment, define unscheduled/null-zone
ownership, and fail closed when it cannot be established. Complete these repairs for each surface
before enabling its agent adapter. This is scoped work, not a requirement to rewrite every module.

### 5. Decisions: transaction reuse needs strengthening

Existing authoritative entry points are `HandoverService.resolve`, `IncidentsService.transition/update`
and `RequestsService.decide`; reuse their lifecycle, audit and notification behavior. However:

- Operational decision commands have no expected source version/step or application idempotency key.
  Row locks serialize changes but do not prove that a recommendation refers to current evidence.
- Requests/incidents have no integer version. Handover answer/photo changes call `touch` without
  incrementing the report version. A report version alone is therefore not a complete freshness key.
- Handover acceptance inserts one `bonus_point_awards` row; requests can change schedule versions,
  intervals or approved minutes. Corrections already have `applyWithin`; other decisions need scoped
  transaction-aware internals so action receipt and domain effects commit in one transaction.
- Sources are hardcoded WEB in handover/incident paths and WEB for non-employee requests; request audit
  currently runs only for WEB_USER. Existing SYSTEM actors cannot simply be passed through unchanged.

Add an agent application envelope: run ID, command ID, expected input hash, expected status/step and
policy version. Validate under locks, including dependent evidence and current grant/policy eligibility.
Use deterministic lock order; ensure writers lock/version affected dependencies consistently. A changed
policy, photo, reference or approval step requires re-evaluation. Repeat command IDs return their saved
receipt; conflicting payloads fail. Preserve old callers until their contracts are deliberately migrated.

Use SYSTEM source with explicit `master-agent`, policy/run/command provenance; human confirmation must
retain the actual human actor. Keep AI outcome and decision authorship separate. SYSTEM actions need
complete audit coverage. Do not store a textual agent name in the UUID event actor column.

### 6. Incidents, requests and delivery: capability boundaries

Incident history already contains reports/photos, severity, stopped-work flag, assignee, SLA, causes,
solutions and status history. Build a bounded server-side related-case query filtered by scope and
reason/zone, ranking confirmed cause/solution records first. There are only two such records today.
An old resolution is a suggested precedent, not proof of the current repair or authority to merge.

Request routes already cover 11 types. First review LATE, EARLY_LEAVE and CANNOT_ATTEND; summarize
actual requested minutes, relevant assignment/session and current approval step. SWAP review can be
added when the counterpart step is complete. CORRECTION and overtime require a preview of resulting
intervals/approved time before any execution. VACATION/DAY_OFF/EXTRA_SHIFT/APPEAL are head/HR routes;
SICK attachments are excluded entirely from the master context. TECH_ISSUE goes to ADMIN. Do not let
an agent approve another role's step or silently choose approved minutes without an approved policy.

`notification_outbox` already makes notification intent transactional and deduplicated. The relay
supports EMPLOYEE recipients; WEB_USER entries are skipped. Incident SLA records an escalation event
and timestamp, but inspection did not find a worker consumer delivering those events to a master.
Thus an escalation event alone is not proof that a master receives an alert.

Initial escalation means a visible actionable item in the existing scoped master queue. Before relying
on unattended urgent operation, implement a named on-duty recipient/channel, delivery status and fallback.
Reuse outbox where supported; do not involve the release changelog group. Telegram send followed by a
process crash can produce an ambiguous delivery outcome; claim idempotent database actions/intents,
not exactly-once external messages. AI analysis must never set `acknowledgedAt` or end first-response SLA.

## Target implementation and data additions

Flow: domain submission -> durable review intent -> prepared scoped snapshot -> deterministic checks
-> required photo analysis -> optional text synthesis -> validated evidence-linked review -> human action
or an explicitly allowed autonomous command. Photo analysis and synthesis do not run in an open DB
transaction. The first useful release automatically reviews eligible reports but leaves decisions human.

Add only the following persisted concepts; keep original domain and photo tables:

| Proposed addition                        | Purpose and required constraints                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master_review_policies`                 | Immutable published versions per explicit scope/family or request category; mode OFF/SHADOW/ASSIST/AUTO_LIMITED; applicable criteria, references, allowed actions, limits, owner and activation state; editing shared photo rules does not silently enable autonomy                |
| `master_review_runs`                     | Exactly one typed target FK (handover/incident/request), enforced by SQL; input snapshot/hash, policy/model/prompt versions, referenced photo runs, structured result, attempts/usage/times/error; unique logical admission identity; result lifecycle separate from domain status |
| `master_review_feedback`                 | Human corrected findings and actual decision link, reviewer and run IDs; append-only feedback revisions; distinguish not reviewed from agreement                                                                                                                                   |
| `master_review_actions` (autonomy stage) | Unique command key plus payload hash, review provenance, resulting domain event/decision IDs and execution receipt; persisted atomically with domain changes                                                                                                                       |

Separate execution status (waiting/running/succeeded/failed/stale/skipped) from review outcome
(no issue detected/issues found/insufficient evidence) and recommendation (typed domain action or
human escalation). Runtime-validate all JSON with Zod. Keep evidence IDs and source locations; no
hidden reasoning trace is needed. Do not duplicate image bytes, employee profiles or human labels.

Use the existing `background_tasks` store with a new MASTER_REVIEW kind, concrete versioned payload
and reconciliation of missing eligible intents. Extend the kind constraint/guard through a migration.
Its `sourceEventId`/`targetSessionId` columns currently belong only to BONUS_RECALCULATE: put the review
run reference in payload unless deliberately migrating that invariant. Reuse stable admission times;
a retry must not change immutable task intent. Do not repurpose SSE or scan the entire event log forever.

Admission in the domain transaction captures submission and policy; media readiness advances the run
through a bounded recheck and recovery path. Terminal/deleted/superseded inputs are skipped or stale.
Re-run on material evidence changes, not page opens; scope the first backfill to chosen pilot records.
Keep failed/partial results visible and manual decision available.

API ownership: `apps/api/src/master-review` handles policy, admission, scoped reads and applications.
Worker ownership: `apps/worker/src/master-review` handles bounded read/analysis orchestration, using
existing photo inspection as a dependency. Share pure rule contracts in `packages/domain` and Zod
DTOs in `packages/contracts`; database admission helpers live in `packages/db`. Do not import Nest
services into the standalone worker. Human apply goes through API. If autonomy is enabled, an API-owned
durable command consumer can use injected domain services; do not expose unrestricted DB/model tools.

Frontend: add `features/master-review/{api,model,ui,index.ts}` and compose with photo inspection and
incident management at a page/widget boundary. Legacy `handover/HandoverPage.tsx` and
`requests/RequestsPage.tsx` become thin composition points as their affected detail flows move into
coherent slices. No peer-feature deep imports, mirrored Query data or forbidden React hooks.
Use existing RowDetail/WorkflowSection, QueryFeedback/loading state, photo viewer and three catalogs.

## Ordered delivery backlog

Tasks below are concrete deliverables, not authorization to implement the full plan automatically.
Each scoped writer task must end with its acceptance evidence; reuse existing CI for the full gate.

| ID / priority | Change and principal ownership                                                                                                                      | Acceptance and smallest relevant verification                                                                                                                                                    | Depends on                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| A1 / P0       | Curate pilot inventory and reconcile contradictory handover/photo product docs                                                                      | Classify 10 reports/24 photos as operational/test/unknown; preserve raw data, identify held-out groups; no assumed 100-200 examples                                                              | Current inventory                               |
| A2 / P0       | Repair scoped handover/photo/media reads and actions using full grants; later apply same boundary to incidents/requests and their streams           | Cross-site/unit and direct-ID/media/export tests fail closed, including missing zone; one independent access review                                                                              | None                                            |
| A3 / P0       | Make the existing vision contract conservative: explicit coverage/invalid/partial states; retain old runs by prompt version                         | Tests for missing quality, malformed boxes, empty response, partially unreadable image, detection truncation and no-rule cases; none can auto-approve                                            | None                                            |
| A4 / P0       | Diagnose provider quota/unavailable results; add attempted-call budget, manual reservation and bounded queue policy; centralize model/prompt config | Provider settings verified without secrets; bounded authorized probe/eval succeeds or exact blocker recorded; compare latency and cost on pilot, not pooled historical versions                  | A1, A3                                          |
| B1 / P1       | Publish pilot review policy and explicit item/reference mapping; preserve family object rules                                                       | All three photo points have defined required view/criteria; one reference is insufficient for other points; version reorder cannot silently remap rules/reference                                | A1                                              |
| B2 / P1       | Add run/policy schema, typed snapshot/result contracts and scope-aware context builder                                                              | SQL target/state/uniqueness checks plus boundary tests; no medical content or signed URLs in snapshots; incomplete evidence explicitly represented                                               | A2, B1                                          |
| B3 / P1       | Factor shared photo admission, add MASTER_REVIEW durable admission/readiness/reconciliation and worker runner                                       | Submit without opening editor starts review; duplicate submits/restarts/media delays/quota exhaustion are recoverable; disabled pilot admits nothing                                             | A3, A4, B2                                      |
| B4 / P1       | Add deterministic whole-report reviewer plus necessary synthesis; link original photo runs and evidence                                             | Each configured criterion checked or marked unknown; cannot-complete/unsafe/unsure/missing-view cases escalate; no operational writes in shadow                                                  | B3                                              |
| B5 / P1       | Add isolated historical replay/evaluation and baseline report                                                                                       | Freeze inputs/policies/model versions; split near-duplicates/shift groups; evaluate photo findings and final action separately; retrospective future information never leaks into input          | A1, B4                                          |
| C1 / P1       | Integrate findings in existing handover row; store master corrections and decision links                                                            | Visible sources, actionable recommendation, loading/offline/failure/stale states; human remains decision author; desktop/mobile and focused decision flow checks                                 | B4, B5                                          |
| C2 / P1       | Add freshness/application envelope and transactional service internals, action receipt and audit provenance                                         | Changing photo, rule, status or reference invalidates apply; duplicate command gives one decision/point/outbox intent; human-v-agent race has one winner; invariant tests and independent review | C1                                              |
| D1 / P2       | Add incident context, bounded related-case query, triage/synthesis and UI block                                                                     | Only authorized related cases; drafts not treated as confirmed repairs; severity floor retained; no autonomous resolve/merge; SLA remains active                                                 | B2, B5, C1; incident part of A2                 |
| D2 / P2       | Add selected master-step request review and UI block; deterministic time/schedule preview where needed                                              | Correct current step, no counterpart/HR bypass, no guessed minute allowance, synthetic edge cases plus all eligible real examples; medical content excluded                                      | B2, B5, C1; request part of A2                  |
| D3 / P2       | Establish reliable human escalation channel before unattended operation                                                                             | Queue has responsible recipient and due state; chosen external channel has explicit routing/delivery failure handling; WEB_USER skip no longer mistaken for delivery                             | D1; owner channel choice                        |
| E1 / later    | Enable allowlisted automatic application for evaluated categories only                                                                              | Category thresholds met on held-out and fresh data; policy locks, command dedupe, kill switch checked immediately before commit; sampled human audit and rollback to ASSIST verified             | C2, B5 and each category's D tasks/D3 as needed |

A1, A2 and A3 can be investigated independently; writes remain serialized in this checkout. B3-B5 form
one complete shadow-review journey. C1 delivers the first useful assistant. Incidents and requests do
not need to block that release. Autonomy is not needed to deliver automatic review across all three.

## Release gates and experiments

First release: only the selected checklist family, automatic analysis, human decision, no new worker
input. Shadow findings should remain hidden until an independent label/decision when measuring quality;
otherwise AI suggestions contaminate the reference judgments. Label provenance must distinguish manual,
AI-assisted and adjudicated labels, including accepted AI boxes in existing photo reviews.

No fine-tuning now. No vector database now: two incidents with populated cause/solution fields do not justify it.
Do not discard the current tile/voting approach solely for cost: compare current detector, a bounded
whole-photo reviewer, and reference-assisted assessment on the same held-out cases. Add reference-based
analysis only for points with verified relevant references; absence is explicit, not a fabricated norm.

Minimum regression matrix: missing/invalid/duplicate photo; cannot-complete submission; unsafe remark;
rule/catalog/reference change; positional item key remap; contradictory answer/photo; substituted image;
unavailable/limited provider; restart after admission/result/decision; two workers; revoked grant;
human decision while AI runs; request step advanced; missing notification recipient; changed schedule;
no-photo inference about unseen equipment; prompt injection in worker text or image text.

Track critical misses, false alarms, abstention/coverage, human changes, source citation validity,
latency, queue age, attempted calls and known/unknown usage by model/policy/category. Sample no-issue
results too. Existing 8 editor-duration revisions are not an active-time baseline. Observe active review
and waiting separately, excluding idle tabs. Agree numerical release thresholds with the process owner;
zero critical misses in this small sample does not establish zero risk. Drift or severe errors returns
that category to ASSIST without removing prior evidence or disabling manual processing.

## Lean review and remaining owner decisions

Recommendation: **Proceed with a narrower first slice**. Reuse submitted answers, photos and current
master screens; automate evidence preparation and reduce repeated photo opening. No duplicate worker
forms or additional general dashboard. Quantified time savings remain a hypothesis until pilot evidence.

Implementation can be specified with the selected family now. Remaining product decisions are limited:
who curates its reference judgments, which unit is enrolled, the actual approval/exception criteria,
provider spend/data handling limits, and the channel/person receiving urgent escalation. Autonomous
operational decisions and their employee-score/time effects need a separate explicit allowance.

## Verification performed for this plan

Read schemas, domain validators/routes/access helpers, API controllers/services, decision contracts,
worker photo/task/media/outbox/SLA paths and frontend integration points. Compared active API/worker
revision with local source. Ran aggregate-only read-only production inventory. Did not inspect image
bytes, classify employee examples, execute AI inference, mutate production or run application tests.
Formatting and document link/diff checks are the relevant checks for these planning artifacts.

Primary methodological references consulted in the earlier planning pass:
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
They inform workflow/evaluation design; repository claims and counts above come from current inspection.
