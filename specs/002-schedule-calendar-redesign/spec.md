# Feature Specification: Schedule calendar redesign

**Change**: 002-schedule-calendar-redesign | **Created**: 2026-09-13
**Status**: Accepted implementation scope; dependent policies remain gated below
**Baseline**: f66cafc7f78b84d7482bb7ec8d19eaa09c947a91 | **Checkout**: master
**Authority**: Owner requests implementation of the entire [epic #1](https://github.com/leonidkuznetsov18/vakhta/issues/1) in one Codex task, including all 18 current children.
**Product document**: [canonical SC/AC/UX requirements](../../docs/features/schedule-calendar-redesign.md)
**Engineering memory**: [Schedule redesign](../../docs/engineering/features/schedule-calendar-redesign.md)

## RECON: Current Behavior

The existing Schedule slice owns zone/month planning, a people matrix, local drafts and undo,
rotation and batch previews, publication review and version history. Scheduling services own
monthly versions and immutable published lineage; Requests coordinates swaps/absence decisions;
worker delivery owns timers and notifications. This implementation retains these owners.

Inspected `apps/admin-web/src/features/schedule-management/{api,model,ui}`, scheduling controller,
`packages/contracts/src/scheduling.ts` and `packages/db/src/schema/scheduling.ts` at the baseline.
A week is clipped to the selected month; people grouping always renders the whole month; employee
retrieval is capped at 200. Draft writes replace a complete month without an expected revision or
command identity. Assignments store instants, but input only accepts template times. One person/date
per version is enforced by SQL. Staffing, qualification, open-slot and segment models are absent.
Earlier workspace test results are historical evidence, not new executions or redesign acceptance.

`source-inventory.json` records the live 18 children (#4–20 and #54), body hashes and source IDs.
The source bodies enrich the old publication catalog; `001-roadmap-issue-catalog` is not this plan.

## SPEC: Outcome and Boundaries

Deliver one calendar workspace for planners, masters and authorized reviewers, with employee
communication through the existing Telegram workflow. Preserve all canonical SC-01–50 requirements,
AC-01–11 and UX-01–15 by reference; the matrix below assigns their implementation ownership.
SC-46–49 remain in scope tracking, blocked on separate concrete domain/input decisions; no silent
removal or completion from their prior deferred labels. Work proceeds independently where gates
are irrelevant. Existing policy applies until an explicit new decision is recorded.

First implementation stage: a rendering/interaction prototype and coherent resource/day/week/mobile
workspace preserving template/month writes and current permissions. New cross-month writes,
qualification enforcement, master writes and financial behavior cannot be implied by a prototype.

Non-goals: replacing the attendance FSM, native apps, employee check-ins per segment, a second
notification channel, autonomous AI publication, guessed financial/workload data, paid services
without authorization, deleting historical evidence, production employee actions for testing.

### Accepted design correction — 2026-09-13

The owner removes prior restrictions on components, Sheets, expanded sub-rows and palette. Choose
professional calendar interactions from the actual planning task and researched competitor patterns.
A side panel is allowed and preferred for focused assignment details/editing when it keeps the grid
stable; use a full-width panel on narrow screens. Color may distinguish meaningful states and must
remain understandable with text/icons. This replaces the mandatory inline-detail design assumption.

### Decisions and assumptions

| Decision | Pending question / dependency                                                                                                   | Safe independent work                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D-01     | Master prepares/submits in scoped zones versus broader publication authority; owner question pending                            | Existing roles unchanged; render permitted data          |
| D-02     | Administrator/production ownership of dated norms and verified qualifications; owner question pending                           | Unknown coverage remains unknown                         |
| D-03     | Hard overlap/required qualifications; explicitly configured rest/hours severity and exception authority; owner question pending | Model interfaces; no invented numeric limits             |
| D-04     | One parent with non-overlapping zone segments; gaps/break/relief and custom-time attendance semantics need agreement            | Existing standard templates and stored instants          |
| D-05     | Monthly review/publication ownership with atomic multi-version commands versus grouped review                                   | Aggregate read projections; no partial multi-month saves |
| D-06     | Offer audience, interest/selection and source/destination borrowing approvals                                                   | Existing request routes; no automatic assignment         |
| D-07     | Separate go/defer/reject for SC-46–49, actual inputs/system/owner/rates/currency                                                | All non-financial calendar work                          |

These are unresolved decisions, not approved defaults. Pilot participants, unit and baseline
measurements require real planner/day/night-master input; a synthetic agent benchmark is distinct.
No task is complete solely because it was planned, documented, locally tested or deployed.

## User Scenarios and Testing

### US1: Plan and communicate reliably (Priority: P1)

Select unit, period and zone/person grouping; create/edit a template shift in context; preview a
complete diff; save a draft, recover it, undo/redo, submit and publish with permitted authority.
Switching grouping retains dates and assignment identities. History stays read-only; queue admission,
acknowledgement and actual presence remain separate evidence. Employee sees only their current plan.

Acceptance: canonical SC-08–12, SC-18–31 (excluding ownership assigned to US2/US3 below), AC-01,
AC-05/06/08/09/10; publication affects only intended recipients and timeout retry cannot duplicate work.

### US2: Resolve qualified staffing gaps (Priority: P1)

See known/unknown time-and-role demand; explain candidate eligibility and full-batch conflicts;
collect interest for deliberate offers; authorize one selection; evaluate both sides of swaps and
borrowing with existing Requests approval. Absence and recorded presence never imply employee fault.

Acceptance: SC-01–07, SC-13–17, SC-33/34/38; missing norms are unknown, two short assignments cannot
cover a longer required interval, competing allocations cannot double-book a person or slot.

### US3: Plan partial work and understand evidence (Priority: P2)

Edit parent/custom time and explicit segments/breaks with a whole-plan preview; preserve history,
reminders and attendance meaning. Inspect workload with units/cohort, scoped notes, linked evidence,
retrospective output, complete print/export, personal revocable feeds and reviewed allocation.

Acceptance: SC-32, SC-35–37, SC-39–45/50; hidden parts survive edits, print/export is complete and
formula-safe, revoked feeds deny access, proposals never self-publish. Optional fields require defined
meaning/type/audience and do not lengthen ordinary shift creation.

### US4: Resolve gated forecasts and financial exchange (Priority: P2, gated)

For each SC-46–49, obtain explicit decision and real accountable data/system ownership, then write
its bounded contract and implement if accepted. Deferred work remains visibly unfinished in this epic
unless the owner explicitly changes scope. Never create invented demand, rates or integration targets.

### US5: Accept and cut over safely (Priority: P1, integrated)

Reuse valid child evidence and execute the twelve research scenarios across the affected boundaries.
Compare the same synthetic tasks with real planner/day/night masters; authorize a bounded unit pilot.
Retain one authoritative writer and disable incompatible admission instead of downgrading history.
Acceptance: #54, every applicable AC/UX criterion and complete accepted capability evidence.

### Edge Cases

Cross-unit denied scope, expired grants after preview, long names/notes in all locales, 390px layouts,
keyboard/touch, empty active zones, unavailable dependencies, missing identities, >200 employees,
filtered/hidden assignments, changes beyond the visible interval, two editors, uncertain commits,
superseded notification/acknowledgement, midnight/month/year/DST, actual work already recorded,
qualification expiry, overlapping candidates, simultaneous slot selection and private attachments.

## Requirements

### Functional Requirements

- **FR-001**: Preserve all current Schedule journeys and recorded history (US1, AC-01/06/10).
- **FR-002**: Project the same scoped assignments into independent time/resource views with contextual
  actions, complete counts and recoverable accessible mobile interaction (US1, AC-02/08/09).
- **FR-003**: Enforce authority, optimistic concurrency, idempotency, complete write scope and atomic
  multi-version/request effects on the server (US1/US2, AC-03/04/05).
- **FR-004**: Evaluate time/role coverage and full candidate plans using dated owned rules; explicit
  unknown evidence never passes a mandatory check (US2, AC-02/03/07).
- **FR-005**: Keep parent/segment/break/actual concepts and stable history distinct in edits and
  downstream output (US3, AC-04/06/07).
- **FR-006**: Limit notes, links, print/export/feed and proposals to authorized scope and human
  approval, with complete evidence and no automatic publication (US3, AC-03/06/10).
- **FR-007**: Resolve each financial/forecast extension explicitly with actual inputs before its
  implementation; preserve unresolved epic ownership (US4, #20).
- **FR-008**: Close only with integrated tests, inspected screenshots, real participant baseline/pilot
  and an explicit cutover decision for the full agreed scope (US5, AC-11, #54).

### Key Entities

Reuse schedules, versions, templates, assignments and acknowledgements in existing scheduling
contracts/schema; actual shifts remain in attendance. New concepts: version revision/command receipt,
dated demand and qualifications, availability, internal slot/offer/interest, parent segments and
planned breaks, schedule patterns, scoped notes/typed fields, feed token and reviewed proposal.
Final policy-dependent field/transition rules are decided before dependent implementation.

## Success Criteria

Canonical SC-01–50 are capability identifiers (not new numerical metrics). Each has an implementation
owner and required observable check in `acceptance.md`; AC-01–11/UX-01–15 and the twelve research
scenarios must also have evidence. Full redesign cannot be claimed from a first calendar milestone.
No productivity targets are invented before the required human baseline.

## Verification Scope

High risk where authorization, time, transactions, migrations and recovery change: focused real-DB
invariants and failure tests plus one independent review. UI requires focused interactions, relevant
type/lint/build and captured/inspected desktop/390px views in uk/en/ru. Reuse existing fixtures and
CI integration gate. Only custom-time changes require attendance/kiosk checks; bot changes require
relevant worker communication QA. Product pilot and release/CI/deployed evidence remain distinct.
