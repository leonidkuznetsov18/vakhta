# Tasks: [FEATURE NAME]

**Input**: spec.md and plan.md in this change directory
**Authority**: [accepted scope] | **Writer / index owner**: [owner] | **Checkout**: master
**Evidence**: [existing engineering feature memory]

## Task Format and Rules

Use `- [ ] T001 [US1] Description with exact file paths (covers AC-001)` for story tasks; omit the
story marker only for shared work. Replace examples with real tasks. Order dependencies explicitly
and group work by independently verifiable user story.

Tests follow docs/engineering/testing-baseline.md, not an opt-in request. Include practical regression
checks for behavior changes and invariant checks plus one independent review for high-risk changes.
Simple documentation edits need no new application tests or full local build/check.

One writer and one index owner work at a time. Do not mark writing tasks [P], even for different
files. Read-only discovery/review may be parallel when authorized; hand off writing sequentially.
Do not recreate existing infrastructure, introduce empty phases or schedule intermediate releases.

## User Story 1: [Title]

**Outcome**: [observable behavior] | **Acceptance criteria**: [AC identifiers]

- [ ] T001 [US1] [Relevant regression or verification task and exact paths/checks]
- [ ] T002 [US1] [Smallest implementation task and exact paths; depends on T001 where applicable]
- [ ] T003 [US1] [Required validation of the result; reference recorded evidence]

Add stories only if present in spec.md. Use proportionate verification for documentation-only changes.
Preserve useful tests and never weaken a failed check.

## Delivery and Evidence

- [ ] T004 Update the linked product document if behavior changes and the existing engineering memory
      with decisions, Lean recommendation, exact checks and limitations.
- [ ] T005 Inspect task-owned changes, run remaining required checks, and deliver one coherent
      commit/push through the existing master CI/release/announcement path.

## Dependencies and Handoff

Record ordering, owned files, blockers and next action. Reuse checks whose inputs have not changed.
Mark a task complete only when its outcome and required evidence exist. Keep deployment claims
separate from local checks and queued CI.

## Convergence

Compare code with the accepted spec and plan after implementation. Append only demonstrated gaps
within scope as new numbered tasks; preserve completed history. A changed requirement must update
the active spec/plan explicitly before new work. Do not implement an unaccepted expansion.
