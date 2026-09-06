# ADR-0007: Bonus engine as a pure function over the log

- Status: proposed
- Date: 2026-09-05
- Spec sources: 7, NFR-07, AC-13…AC-15, T-14…T-22, T-34, T-35

## Context

The bonus must be deterministic, reproducible, transparent to the employee and independent of downtime duration and safety reports. Rules are versioned and never applied retroactively.

## Decision

Rules live in `bonus_rule_versions` as JSON with an effective date; the code has the typed form `BonusRules` and the recommended spec values. The calculation `scoreShift(rules, criteriaResults)` in `packages/domain/bonus` is a pure function: criteria with statuses earned, missed, not_applicable, pending, appealed, confirmed; N/A is excluded from the denominator; fewer than 60 applicable points forbids an automatic total. Collecting inputs from the log and decision tables is done by the `bonus` module; the result is stored with an input hash. Recompute is triggered by events: shift close, correction, handover decision, incident close, appeal, approved overtime, system incident.

## Consequences

The same log under the same rules version always gives the same result. Changing weights or thresholds is a new version, not an edit. A manual adjustment is a separate record with a reason, an author and a second approval above the threshold.

## Rejected alternatives

Calculation in SQL views: hard to version and test. Storing only the total without criteria: the employee cannot see the basis of a reduction, an appeal is impossible.
