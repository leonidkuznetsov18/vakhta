# ADR-0002: Shift FSM as a transition table, invariants duplicated in the database

- Status: proposed
- Date: 2026-09-05
- Spec sources: 4.3, 4.4, 4.5, AC-05, AC-07, AC-09, T-07, T-08, T-12, T-13

## Context

Shift state transitions are described in the spec as a table with conditions and effects. A mistake in this logic breaks time accounting, downtime, handover and the bonus at once. The logic must be testable without the database and Telegram.

## Decision

Transitions live in `packages/domain/shift-fsm` as data: pairs `(action, from) → { to, guard, effects, resume }`. The pure function `transition(snapshot, action, ctx)` reads no clock and writes nowhere. Property tests verify that no sequence of actions yields two open intervals, gaps or overlaps. The database holds the same invariants: a partial unique index on the employee's open shift, a partial unique index on the open interval, an exclusion constraint on overlapping `tstzrange`.

## Consequences

Changing the transition rules is a change of data and tests, not of scattered code. If the application makes a mistake, the database refuses. The application is obliged to execute transition effects (timers, handover draft, report invalidation) in the same transaction.

## Rejected alternatives

A state-machine library with its own model: adds a dependency without benefit, because the machine is small and specific. Logic inside bot handlers: impossible to test and to reuse in the panel.
