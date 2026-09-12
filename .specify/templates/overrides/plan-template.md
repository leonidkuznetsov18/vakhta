# Implementation Plan: [FEATURE]

**Change**: [identifier] | **Date**: [DATE] | **Spec**: [spec.md]
**Baseline**: [commit] | **Checkout**: master | **Engineering memory**: [link]

## Summary

Describe the smallest approach satisfying the accepted scope. Refer to the spec instead of repeating
requirements. Use repository evidence before external research or custom code.

## Technical Context

Record affected apps/packages, actual installed versions and reusable modules. Preserve Nest/Fastify,
the pure domain, worker and vanilla kiosk boundaries. Apply frontend FSD coherently; do not create
generic src/models, backend/ or frontend/ trees from upstream examples.

## Constitution Check

Read .specify/memory/constitution.md, AGENTS.md and affected engineering standards. Check applicable
domain/access invariants, FSD/public APIs, React hook/state policy, validation, i18n, async recovery,
single-writer workflow and risk-based verification. Recheck after design. Record only real gaps;
do not manufacture exemptions or ask again for an already-authorized scope.

## DESIGN: Ownership and Behavior

Define affected layers/slices/modules, public interfaces, prepared view models and named actions.
Classify state ownership. Describe validation and relevant cancellation, stale results, retries,
idempotency, transactions and after-commit recovery. State compatibility and migration impact.
Link existing contracts and models instead of duplicating them.

## Project Structure and Allowed Files

List exact task-owned source/test/documentation paths and one writer/index owner. Changes stay in
master. specs/<change>/ holds change artifacts; product documentation and engineering memory keep
their existing ownership. Additional research.md, data-model.md, contracts/ or quickstart.md are
warranted only by real questions, new contracts or a useful verification recipe.

## Lean Review

Record the existing Lean skill's proceed/simplify/defer recommendation in the linked engineering
memory and summarize its implication here. Keep developer-only reviews brief; do not invent metrics.

## IMPLEMENT: Ordered Delivery

Describe dependency-ordered steps to generate in tasks.md. Omit infrastructure/setup already present.
Serialize writes; batch one coherent delivery without intermediate documentation pushes. No PRs,
branches, worktrees or automatic Git extension.

## VERIFY and HARDEN

Choose the smallest sufficient checks under docs/engineering/testing-baseline.md. Map acceptance
criteria to checks and relevant failure/boundary cases. Include regression tests for behavior and
invariant tests plus one independent review for high-risk changes. Identify exact commands and only
affected visual/live QA. Record blocked evidence honestly; reuse valid existing results.

## REPORT and Documentation

Update current product behavior when applicable. Record decisions, evidence, limitations and remaining
work once in the linked engineering memory; cite it from completed tasks. Distinguish local checks,
CI/release/announcement outcomes and verified deployed behavior.

## Open Decisions

Record only material unresolved decisions and their consequence, or state None. Do not add speculative
abstractions, unrequested performance goals or approval gates to fill sections.
