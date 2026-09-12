# Feature Specification: [FEATURE NAME]

**Change**: [identifier] | **Created**: [DATE] | **Status**: Draft / Accepted / Superseded
**Baseline**: [commit] | **Checkout**: master | **Authority**: [owner request or issue]
**Product document**: [existing docs/features document, or N/A for developer-only work]
**Engineering memory**: [existing docs/engineering/features document]

## RECON: Current Behavior

Describe the actor, observed problem and current behavior. Link source files, contracts, tests and
existing documentation. Separate facts from hypotheses. This spec describes one change, not the
entire feature. Follow docs/templates/spec.md across spec.md, plan.md and tasks.md; do not create
a duplicate standalone specification.

## SPEC: Outcome and Boundaries

Describe expected behavior, scope, non-goals, compatibility and explicit assumptions. List only
material unresolved questions; do not invent requirements or approval gates. Use the existing
feature's domain language. Include relevant permissions, failure/retry and mobile constraints.

## User Scenarios and Testing

### US1: [Primary journey] (Priority: P1)

Describe the actor, value and independently verifiable outcome. Add further stories only when needed.

**Acceptance scenarios**:

- **AC-001**: Given [state], when [action], then [observable result].
- **AC-002**: Given [relevant failure or boundary], when [action], then [recovery or rejection].

### Edge Cases

List relevant boundaries, unavailable states and compatibility cases. Do not expand into unrelated
hardening. State when a concern is inapplicable and why.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST [bounded behavior], verified by [acceptance criterion].

### Key Entities

Link existing domain definitions when needed; describe only new or changed meaning.

## Success Criteria

- **SC-001**: [Observable outcome linked to acceptance criteria; do not invent numeric targets.]

## Verification Scope

Classify the change under docs/engineering/testing-baseline.md. Required behavior/invariant tests
are requirements even when the owner did not explicitly ask for tests. Identify changed product
surfaces and relevant visual/live QA; developer-only changes need no product QA. Store actual
results in the linked engineering memory; plan.md defines exact checks.
