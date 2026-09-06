# ADR-0001: Event log with transactional projections

- Status: proposed
- Date: 2026-09-05
- Spec sources: 4, 4.5, 11, FR-COR-03, NFR-07, AC-16, AC-18

## Context

The spec requires the server event log to be the source of truth, events to never be edited, a fix to create a compensating record, and time and bonus calculations to be reproducible from the log. At the same time the panel must show the same state as the bot within 5 seconds, and shift invariants (exactly one active interval) must hold strictly.

## Decision

Every state change happens in one PostgreSQL transaction: it appends a row to `domain_events` (append-only, triggers forbid UPDATE and DELETE) and updates the current-state tables (`shift_sessions`, `activity_intervals`, `presence_sessions`, `handover_records`). Aggregates (`shift_summaries`, reports) are projections that can be recomputed from the log. Full event sourcing with asynchronous projections is not used.

## Consequences

The state is always consistent with the log at commit time, so AC-18 holds by construction. Invariants can be kept as database constraints. Recomputing from the log remains possible for NFR-07 and for audit. The price: every state write must go through the single application-services layer, never through direct UPDATEs.

## Rejected alternatives

Full event sourcing with separate projections: eventual consistency contradicts "panel = bot" and complicates invariants. CRUD without a log: loses immutability and reproducibility.
