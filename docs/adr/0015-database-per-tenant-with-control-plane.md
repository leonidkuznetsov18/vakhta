# ADR-0015: Database per tenant with a separate control plane

- Status: proposed
- Date: 2026-09-21
- Spec sources: owner request 2026-09-21; `specs/011-multi-tenant-control-plane/spec.md`; ADR-0009 (scopes); product-vision KPI "deployment time at a new site: days, not months"

## Context

Vakhta serves one customer from one deployment: one database, one bot, one panel and kiosk host.
The owner wants to add client plants quickly, each with its own database, bot, kiosk and branded
interface, created from a platform control panel that assigns modules per client. Fifty-plus tenant
tables and their invariant tests exist; access boundaries are a correctness requirement.

## Decision

Each tenant gets its own PostgreSQL database on a shared cluster, its own Telegram bot, its own
hostnames for panel, kiosk and API, and prefixed object-storage and Redis keys. The API and worker
stay shared and stateless: every request and every job runs inside an explicit tenant context
(`AsyncLocalStorage`) that supplies the database, auth instance, bot and prefixes, and fails closed
without one. A control registry in its own database, owned by a separate `control-api` service and a
`control-web` app, holds tenants, modules, domains, encrypted secrets, branding, operators,
provisioning jobs and an append-only audit log. Provisioning is a durable, idempotent, resumable job.
`TENANCY_MODE=env` builds one tenant from the current environment so the existing customer, local
development and CI keep running until the registry cutover.

## Consequences

Simpler: the tenant schema and its tests do not change; one deployment pipeline serves all tenants;
a dedicated tier for a large client is a registry row pointing at another cluster or API host.
Harder: connection budget grows with the number of tenants (small pools per tenant, one service to
watch); migrations and backups iterate tenants; every non-request code path must set its context
explicitly; hostname automation depends on provider APIs. Closes the "own database, bot, kiosk"
requirement and the isolation criteria AC-005–010 of the spec.

## Rejected alternatives

- One full deployment per tenant: literal isolation, but each tenant costs API, worker, Postgres
  and Redis services and needs deploy-time work; kept as a manual option for contractual cases.
- Shared database with a `tenant_id` column: cheapest, but contradicts the owner's requirement and
  turns every query into an access-boundary risk.
- Control plane inside the tenant API process: cheaper, but provider tokens and the cluster admin
  URL would live in the process that serves tenant traffic.
