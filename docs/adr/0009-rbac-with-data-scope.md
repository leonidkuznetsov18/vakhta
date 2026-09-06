# ADR-0009: RBAC with a data scope and isolation of medical documents

- Status: proposed
- Date: 2026-09-05
- Spec sources: 2, FR-AUTH-03, FR-REQ-02, FR-WEB-04, 13, T-39, AC-18

## Context

Nine roles with different data volumes: the shift master sees only their scope, HR separately receives personnel and medical data, accounting only confirmed aggregates, the auditor read only.

## Decision

`web_user_roles(user_id, role, scope_type, scope_id)`, where the scope is a site, a unit, a team or a zone. Every panel request passes through a scope filter that adds predicates to queries. Medical documents live in a separate table with access only for HR; every view is audited. Denied access is logged. Panel authentication: password + TOTP or corporate OIDC.

## Consequences

One permission model for all panel sections. Adding a role is data, not code. Every endpoint must be tested for leaks outside the scope.

## Rejected alternatives

Row-level security in PostgreSQL: a strong guarantee, but harder to debug and to combine with a connection pool; may be revisited after the MVP.
