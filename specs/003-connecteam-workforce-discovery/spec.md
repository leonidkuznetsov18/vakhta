# Feature Specification: Connecteam-informed workforce discovery

**Change**: 003-connecteam-workforce-discovery | **Created**: 2026-09-13
**Status**: Accepted for research and backlog refinement; candidate product contracts remain Draft
**Baseline**: `f66cafc7f78b84d7482bb7ec8d19eaa09c947a91` | **Checkout**: master
**Authority**: Owner request to analyze Connecteam features, design, UI/UX and logic, then update important feature specifications and GitHub issues
**Product document**: Existing feature docs remain current behavior; this change adds no runtime feature
**Engineering memory**: [Connecteam reference](../../docs/engineering/features/connecteam-reference.md)

## RECON: Current behavior

The [deep analysis](../../docs/research/2026-09-13-connecteam-deep-research.md) preserves CT-01–90 and
distinguishes documented competitor behavior, visually inspected examples, code facts and proposals.
The [original matrix](../../docs/research/2026-09-12-connecteam-functionality.md) is a dated snapshot.
GitHub epic [#3](https://github.com/leonidkuznetsov18/vakhta/issues/3) already has 18 workforce children,
#36–53. Schedule #1 and AI Master #2 own their existing delivery streams; no duplicate epic is needed.

Vakhta has versioned CHECK/NOTE/PHOTO checklists, master-reviewed handovers, incidents, structured
requests, Telegram delivery infrastructure, assignment acknowledgment and a repository-grounded
product-help assistant. It has no verified general employee corrective-task, company SOP publication,
qualification evidence or onboarding-pack model. Background execution tasks are not employee tasks.
The report links the source paths rechecked for these boundaries. Concurrent calendar source/spec
edits are another task's work and are not counted as implemented or modified by this change.

## SPEC: Outcome and boundaries

Deliver a comprehensive cited competitor report, visual evidence and an actionable refinement of
existing issues. The numbered candidate contracts below express useful future behavior; the current
authorization covers their specification and issue publication only. A selected delivery stream must
resolve its named operating decisions and produce a bounded implementation plan/tasks before coding.
Do not silently declare a pilot, price, deadline, assignee or manufacturing policy agreed.

Non-goals: runtime implementation, production employee actions, new subscriptions/accounts, a clone of
Connecteam branding, payroll, ERP/MES/access-control integrations, equipment/OEE, biometrics, autonomous
AI decisions and changes to the active Spec Kit feature pointer. Preserve the existing Schedule/AI
specifications and the historical issue-catalog payload. No product-help document should teach proposed
behavior as already available.

## Candidate product contracts

These contracts are proposed acceptance requirements, not evidence of completed product functionality.
Each contract belongs to the linked existing issue; related issues reuse it rather than implement a
second copy. Suggested states describe meaning, not final database enums.

### C1: Reliable operational notices

**Owner**: [#53](https://github.com/leonidkuznetsov18/vakhta/issues/53); reuse #7 for schedule and #34 for AI escalation.
**References**: CT-20, CT-43, CT-47, CT-86–88. **Recommendation**: Prioritize existing reliability.

The master needs to know which incident requires attention and whether responsibility has been accepted.
Reuse the existing outbox. Keep business event, recipient resolution, transport attempt, provider-sent
result and explicit acknowledgment as separate facts. Current source escalation-event persistence alone
does not demonstrate an outbound notification consumer or production delivery failure.

- **C1-AC01**: Given a relevant event, resolve an authorized recipient from current unit/zone authority,
  persist a deduplicated delivery intent and expose the linked record. An unavailable recipient yields
  a visible unresolved routing state and an agreed fallback, not silent success.
- **C1-AC02**: A provider send result updates transport state only. Explicit acknowledgment records actor,
  time and exact event/content revision; a master cannot be impersonated by an administrator-set status.
- **C1-AC03**: Duplicate processing, Telegram failure and uncertain responses preserve the original intent
  and evidence. Retry does not create another business incident/task; externally duplicated delivery,
  if unavoidable, remains distinguishable from exactly-once business effects.
- **C1-AC04**: A resolution, superseded assignment or changed recipient invalidates stale pending reminders.
  Authorization and current state are rechecked at delivery/action time. No obsolete deep link mutates a
  newer record without an explicit stale-state response.
- **C1-AC05**: The panel filters failed/unacknowledged items with age, responsible role and next action.
  Telegram clearly identifies context. No operational acknowledgment is inferred from opening a screen.

**Open decisions**: recipient/fallback policy, escalation timing and which notices are urgent. No invented
SLA. These are fixes to agreed behavior where applicable, not new billable functionality by relabeling.

### C2: Linked corrective actions

**Owner**: [#43](https://github.com/leonidkuznetsov18/vakhta/issues/43). **References**: CT-36–40.
**Recommendation**: Prioritize one-off actions before recurrence.

A master turns a recorded finding into one action with an accountable owner, deadline and original
evidence link. Proposed flow: open → in progress → completion submitted → verified, with reasoned
return/reopen/cancel paths where policy requires. Participants may help without erasing accountability.

- **C2-AC01**: Creating an action from an incident/handover reuses source identifiers and attachments;
  duplicate submission returns the same result. The reporter does not re-enter the original report.
- **C2-AC02**: Exactly one accountable owner is visible. A transfer records old/new owner, actor, reason
  and time and notifies the appropriate recipients; a missing/unavailable assignee remains actionable.
- **C2-AC03**: Completion records who did what and links the required evidence. If verification applies,
  completion remains awaiting review until an authorized verifier accepts or returns it with a reason.
- **C2-AC04**: Ending a shift does not close unresolved work. Reopen/cancel/transfer preserve append-only
  history and the original incident; concurrent edits produce recoverable conflict handling.
- **C2-AC05**: Worker sees a short personal action list; master sees overdue/unassigned/awaiting-review
  queues. Filters/counts are scoped and complete; closed records show read-only evidence. Recurrence,
  if selected later, has separate occurrence identity and never rewrites completed history.

**Open decisions**: allowed creators/owners, completion evidence by action type and whether independent
verification is required. Do not turn every checklist item into a second employee task.

### C3: Bounded form and submission improvements

**Owners**: [#41](https://github.com/leonidkuznetsov18/vakhta/issues/41), [#42](https://github.com/leonidkuznetsov18/vakhta/issues/42).
**References**: CT-26–35. **Recommendation**: Simplify around two or three real repeated processes.

Extend the existing versioned checklist system only for missing input/evidence patterns. Reuse handover
review and current photos. Select choice/number/description fields only when actual forms establish need;
formula execution, AI conversion and an unrestricted workflow editor are deferred.

- **C3-AC01**: An author previews the actual worker sequence in all supported locales, including required
  fields and conditional branches. Preview uses the same contracts as execution.
- **C3-AC02**: Conditions reference stable field IDs. Missing references/cycles/incompatible types block
  publication with specific errors; invisible required inputs cannot trap a worker. Define hidden-answer
  handling before implementing arbitrary branching.
- **C3-AC03**: Published versions and submitted evidence remain immutable. New definitions create revisions;
  an in-progress report stays bound to its effective definition. Numeric values carry units and validation.
- **C3-AC04**: Submitted records show one review owner and explicit decision state. Required actual fields
  are validated; a checkbox saying another form was completed is not accepted as equivalent evidence.
- **C3-AC05**: Quota/deadline restrictions retain a visible completed/closed/blocked explanation instead of
  disappearing without context. Reminders target outstanding obligations and stop when obsolete. Any bulk
  export states selection/filter/timezone and preparation failure without broadening attachment access.

**Open decisions**: real form examples, required field types, missing/hidden answer semantics and reviewer
authority. Preserve the current shift-closing invariant and master-only handover decision.

### C4: Versioned production instructions

**Owner**: [#47](https://github.com/leonidkuznetsov18/vakhta/issues/47); notices in #45, operational AI in #2.
**References**: CT-19, CT-47, CT-56–60. **Recommendation**: Prioritize short contextual SOPs.

An authorized author publishes a short instruction with approved photos, a named owner, revision and
role/zone relevance. Workers reach it from the current work context rather than searching a deep tree.
Draft → published → superseded/withdrawn describes content lifecycle; acknowledgment is separate.

- **C4-AC01**: Publishing records immutable content revision, scope, owner and effective time. Preview
  identifies affected workers. Editing creates a draft; it cannot silently change previously accepted text.
- **C4-AC02**: Workers see the relevant current instruction and an explicit unavailable/superseded explanation
  for stale links. Historical acknowledgments retain their exact revision and actor without exposing
  currently unauthorized content.
- **C4-AC03**: Acknowledgment attaches to that revision; materially changed instructions create a new
  obligation where policy requires. Unchanged daily material does not demand repeated confirmation.
- **C4-AC04**: Search and navigation return only authorized current sources. A knowledge answer, if later
  enabled, cites an approved revision and defers when evidence is absent; retrieval respects removal and
  scope. Product-help AI must not silently acquire employee/shift/medical data.
- **C4-AC05**: Short text/photos remain usable in Telegram/mobile, with the original source reachable and
  a named contact for questions. Reading is never represented as practical qualification.

**Open decisions**: content/translation approvers, material-change policy and live-audience versus
publication-snapshot obligations. AI support is optional after deterministic content controls.

### C5: Targeted announcements and acknowledgments

**Owner**: [#45](https://github.com/leonidkuznetsov18/vakhta/issues/45); delivery infrastructure in #53.
**References**: CT-41–48, CT-81. **Recommendation**: Prioritize relevance over a social feed.

Admins publish operational notices to a reviewable audience derived from canonical structure and, where
appropriate, shift context. Keep draft/scheduled/published/expired/cancelled states explicit. Nonurgent
delivery at the next relevant shift is a candidate; urgent incidents follow their own escalation policy.

- **C5-AC01**: Before publication, preview scope and recipient count, relevant revision, schedule/timezone
  and whether acknowledgment is requested. Recheck recipient access when actually sending.
- **C5-AC02**: Distinguish provider-sent, explicit acknowledgment and outstanding status per recipient.
  Postponement/expiry never fabricates acknowledgment. Revoked or superseded notices cannot be acknowledged
  as current through stale callbacks.
- **C5-AC03**: Editing a scheduled notice does not leave two active sends. Failed or uncertain rescheduling
  preserves the true current schedule and reports recovery clearly. Retries do not create duplicate obligations.
- **C5-AC04**: Follow-up targets unresolved recipients only. The worker sees the action, relevant change,
  deadline and contact before decorative content. No generic blocking pop-up interrupts critical operations
  unless a separately defined prerequisite actually requires a block.

**Open decisions**: urgent versus nonurgent policy, audience changes between scheduling/delivery, expiration
and who can publish. Corporate chat, events and reactions are not dependencies.

### C6: Qualification evidence and learning

**Owners**: [#48](https://github.com/leonidkuznetsov18/vakhta/issues/48), [#49](https://github.com/leonidkuznetsov18/vakhta/issues/49);
eligibility consumes the result through #11/#12. **References**: CT-23, CT-61–68, CT-81.
**Recommendation**: Conditional priority after real requirements and assessor authority are identified.

Keep learning progress, assessment evidence, protected documents and qualification authorization
separate. A qualification records the person, required capability, scope, validity and authorized
assessor. Proposed statuses include pending evidence, awaiting assessment, valid, expiring, expired
and revoked; expiry is a time-dependent fact rather than a user-editable profile tag.

- **C6-AC01**: A selected role requirement has an authoritative owner and effective interval. Uploaded
  evidence or a passed quiz does not automatically grant authorization; an authorized assessment is recorded.
- **C6-AC02**: Course/quiz/manual classroom completion records provenance, content revision, actor and time.
  Administrative completion remains distinguishable from employee activity and practical assessment.
- **C6-AC03**: Renewal preserves previous evidence and approvals. Individually expiring certificates use
  their own validity dates; a generic recurring document deadline must not override an approved renewal.
- **C6-AC04**: A planner sees the minimum permitted qualification status/reason, not medical or unrelated
  personnel documents. Access is rechecked on evidence retrieval and mutation.
- **C6-AC05**: #11/#12 evaluate validity for the proposed work interval and recheck on assignment commit.
  Required safety authorization cannot become a soft optimizer preference. Configurable non-safety warnings
  and exception authority require an explicit policy; no new numeric limits are inferred from Connecteam.

**Open decisions**: qualification taxonomy, assessors, validity/timezone boundaries, expiry-during-shift
policy, legacy evidence and warning/blocking rules. A broad LMS or document-signing system is not required.

### C7: Onboarding responsibility and review

**Owner**: [#51](https://github.com/leonidkuznetsov18/vakhta/issues/51); reuse C2/C4/C6 rather than duplicate data.
**References**: CT-79–80. **Recommendation**: Simplify to a role-specific starter pack.

A new worker sees their own required actions; the supervisor sees theirs and the unresolved review.
Identity activation, employee completion, supervisor completion and permission to work are separate.

- **C7-AC01**: A pack identifies required/optional items, responsible actor and assignment-relative dates.
  Existing identity, SOP, evidence and action records are linked rather than copied into a parallel store.
- **C7-AC02**: If worker items are complete but supervisor items remain, display waiting for supervisor with
  a named responsibility. Hidden administrator fields must not produce an unexplained worker failure.
- **C7-AC03**: Approval and reopening record actor, reason, version and time. Changes to the assigned pack
  state their effect on already completed work; history and qualification decisions are preserved.
- **C7-AC04**: Reassignment, unavailable supervisor and upload failure have explicit recovery. Completion
  of the pack alone does not grant a job qualification or scheduled assignment.

**Open decisions**: initial pack contents, supervisors, deadline rules and completion/approval policy.
Recruitment, applicant screening, US government forms and payroll setup are outside this slice.

## Cross-cutting design requirements

- **UX-01**: Keep context, current status and next responsible action together. Use shared expanded rows
  for record details and read-only presentation after resolution; one view answers one task.
- **UX-02**: A label accompanies every status color/icon. Essential information/actions work with keyboard
  and touch; avoid hover-only details or drag-only actions. Show exact blocked reasons.
- **UX-03**: Preview audience and worker experience before publication. No-op save/apply/reset controls
  are natively disabled and guarded; preserve edits after failure.
- **UX-04**: Distinguish initial loading, background refresh, offline/paused, error/retry and successful
  empty states. Keep cached data stable, show complete filtered counts, paginate and bound long content.
- **UX-05**: All user-facing strings exist in uk/en/ru. Verify affected desktop and mobile layouts with
  inspected screenshots; the competitor image atlas is not Vakhta QA evidence.
- **UX-06**: Audience selection, directory filtering and UI visibility never replace server authorization.
  Historical evidence is append-only; uncertain writes require readback before unsafe retries.

## Research and publication acceptance

- **AC-001**: All CT-01–90 IDs have distinct workflow/rule/UX/adaptation analysis with primary sources.
- **AC-002**: Visual evidence has source provenance and explicitly separates documented examples from
  live application testing; no untested accessibility/performance/security claims appear.
- **AC-003**: C1–C7 and UX-01–06 map to existing owners, preserve current architecture and define recovery,
  access and unresolved policies. Schedule/AI scopes are linked rather than duplicated.
- **AC-004**: Update existing GitHub #3/#36–53 with traceable findings and specific acceptance additions;
  retain original body, stable marker, title, labels, state and hierarchy. Read back changes and retain receipts.
- **AC-005**: Publish only task-owned docs/spec/assets; preserve concurrent work and active feature state.
  Format, source-ID coverage, links and diff checks pass. Product implementation/tests remain out of scope.

## Success and verification scope

The owner can inspect each competitor capability, see what is useful for this factory and open the
existing issue with actionable acceptance requirements. Local validation covers documentation and
publication integrity only. Future implementation needs relevant domain/integration/UI tests for the
selected contract, especially scope, history, duplicate processing, stale revisions and notification
recovery. No product tests or production pilot are claimed by completing this research specification.
