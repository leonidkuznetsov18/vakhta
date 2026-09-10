# Specification: <feature>

Status: draft / accepted / superseded. Owner: <role>. Baseline: <commit>. Authorized scope: <request or issue>.

## RECON

Observed problem, affected actors, existing behavior, source files, constraints and reuse candidates.
Separate facts from hypotheses. Link the product document and feature memory.

## SPEC

Outcome, scope, non-goals and concrete acceptance criteria, including failures, permissions, mobile and
retries where relevant. List only unresolved decisions that block implementation. Existing authorization
and clear criteria are sufficient; do not create a redundant approval ceremony.

## DESIGN

FSD slice or backend/domain ownership, dependency direction, public API, state ownership, data validation,
async lifecycle, compatibility and migration risk. Include a small diagram only when useful.

## IMPLEMENT

Independently reviewable steps and permitted files. Assign one exclusive writer in the current checkout and a single
integration/index owner. Do not create a PR, topic branch or worktree. Describe meaningful regression tests before implementation. No work beyond the accepted scope.

## VERIFY and HARDEN

Commands, behavioral evidence, edge cases, access boundaries, observability, deployment/rollback checks
where applicable. Identify the independent reviewer and QA scope. Record actual results in feature memory.

## REPORT

Acceptance-criteria results, changed contracts/docs, material limits, remaining work and handoff links.
