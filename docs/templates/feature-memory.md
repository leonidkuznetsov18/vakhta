# Feature: <name>

## Outcome and scope

Worker problem, expected benefit, actors and explicit boundaries.

## Current behavior and ownership

Link the product document in `docs/features/`, relevant FSD slices, domain rules and public contracts.
Explain the source of truth and the separation of prepared view models, actions and UI.

## Decisions and reuse

Existing code inspected, maintained solutions considered, chosen approach, sources and tradeoffs.
Record migration debt and any explicitly approved exception. Link ADRs for cross-cutting decisions.

## Lean review

Observed problem and evidence; recommendation (proceed / simplify / defer); smallest experiment;
success measure, worker burden, safety/quality guardrails and rollback condition. Separate facts from
hypotheses. Explain how the change reduces waiting, rework or unnecessary interaction.

## Verification

Date, commit, environment, test identity/role (no secrets), unit/integration/E2E commands and results.
Record panel desktop/mobile, kiosk and worker bot scenarios, screenshots without sensitive data,
error/retry paths and any blocked checks. Distinguish local code from deployed behavior.

## Remaining work

Known risks, open questions and the next concrete step. Update this file with the feature.
