# Feature Specification: Instant tenant onboarding

**Change**: 012-instant-tenant-onboarding | **Created**: 2026-09-22 | **Status**: Accepted
**Baseline**: 752387e | **Checkout**: master
**Authority**: Owner requested the proposed wildcard approach, Spec Kit execution and a timed real tenant creation test.
**Product document**: [Multi-tenant platform](../../docs/features/multi-tenant-platform.md)
**Engineering memory**: [Multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md)

## RECON: Current Behavior

Control creates one database on the shared cluster, migrates and seeds it, then pauses at
REGISTER_DOMAINS. surface.steps.ts compares DNS CNAMEs; it neither registers provider domains nor
checks HTTPS. runner.ts waits for manual retry and activates only after the bot and invitation.
Three per-tenant hosts are added individually to Pages/Railway. The shared registry already maps
verified hosts to isolated databases; API tenant-hook.ts fails closed. Auth also consumes Host.
The existing PostgreSQL provisioning and two-tenant API suites cover recovery and access boundaries.
Production discovery on 2026-09-22 found active SuperFactory Pages domains, two explicit Railway API
hosts, no Worker routes and no resolving random subdomain. Pages does not support wildcard domains.
The existing public onboarding lets the invited administrator set a password; creating tenants is
restricted to platform administrators. This delivery removes infrastructure friction from that flow.

## SPEC: Outcome and Boundaries

A platform administrator creates a company using the current Control form and shares the existing
onboarding link. Platform-owned addresses work without per-company DNS records, certificate requests,
provider registration, deployments or manual domain verification. The company can use its panel
independently of Telegram availability. Existing pilot/SuperFactory hosts, cookies, device identities,
bot webhooks and database isolation remain compatible.

Assumption pending optional owner preference: first deliver the current Control creation flow;
open public self-registration is a separately scoped product flow (identity verification, abuse
limits and email delivery), not silently enabled by exposing operator endpoints. Custom customer
DNS, billing, a shared-database migration, new tenant deployments, bot creation and database warm
pools are outside this delivery. A test-only tenant with dev@vakhta.xyz is explicitly authorized;
no real employees, shifts or existing kiosk pairing are modified.

## User Scenarios and Testing

### US1: Create a usable company without infrastructure work (Priority: P1)

- **AC-001**: Creating a new company in Control on the enabled platform gateway completes database,
  defaults, managed addresses and administrator invitation without an operator pause or provider write.
- **AC-002**: New platform addresses serve their own panel/kiosk/API over valid HTTPS; unregistered
  addresses never serve another company's data. The existing production hosts keep working.
- **AC-003**: A missing or failing optional bot connection does not prevent panel activation;
  bot failures remain visible and retryable independently. When WORKER_BOT is enabled without a
  token, Tasks must show an outstanding Add bot token action, including already-created tenants.
  Saving the token removes that setup action and exposes the actual connection job; disabling the
  module removes the requirement. Completed core provisioning must not imply bot readiness.
- **AC-004**: Temporary gateway checks retry automatically with bounded delay and attempts; permanent
  failures stay visible and retryable. Restart/retry preserves completed database and invite work.
- **AC-005**: A newly active company is visible to the API/public config without waiting for the normal
  registry poll interval; redirects, cookies, CORS and authentication use its verified public host.

### US2: Preserve access boundaries during routing (Priority: P1)

- **AC-006**: Direct requests cannot select a tenant using spoofed gateway/forwarding headers. Gateway
  traffic is authenticated, unknown/suspended tenants fail closed, and cross-tenant cookies/device
  tokens remain rejected. Provider origin TLS validation is retained.
- **AC-007**: Gateway preserves API methods, request bodies, cookies and streaming, never caches
  private API responses, and routes static panel/kiosk assets without cross-surface collisions.
- **AC-008**: Explicit platform hosts and legacy tenant hosts remain outside the new wildcard route
  during rollout. An unhealthy gateway never results in automatically verified managed domains.

### US3: Measure real creation and first use (Priority: P1)

- **AC-009**: After deployment, create a clearly named QA company through Control; record submit,
  provisioning completion, welcome availability and first authenticated panel timestamps separately.
- **AC-010**: Record manual actions, retries, fields/steps and desktop/mobile inspected screenshots.
  Separate human password-entry time from automatic provisioning; report a single run as a sample,
  never as a percentile. Record provider operations per creation and the final QA tenant disposition.

### Edge Cases

Duplicate slug and generated-host collisions; reserved platform names; gateway outage; missing key;
malformed proxy headers; pending/suspended tenant; interrupted job; bot outage; simultaneous creation;
unknown host floods; old deployments without gateway configuration; stale registry snapshots;
explicit DNS entries shadowing wildcard; kiosk module disabled; auth redirects and streaming bodies.

## Requirements

- **FR-001**: Reuse one shared routing and asset deployment for all managed companies (AC-001/002/008).
- **FR-002**: Keep the durable provisioning engine, tenant database isolation and transactional audit
  with bounded recoverable external work (AC-003/004/006).
- **FR-003**: Managed-domain readiness checks must validate the actual HTTPS gateway, not just DNS;
  custom domains retain separate verification and are never implicitly trusted (AC-002/008).
- **FR-004**: Preserve authenticated tenant context throughout proxying and eliminate avoidable new-tenant
  discovery delays while bounding registry reload work (AC-005/006/007).
- **FR-005**: Deliver reproducible timed creation and honest usability evidence (AC-009/010).

### Key Entities

Reuse tenants, tenant_domains, provisioning_jobs/steps, tenant invitations and module codes from
packages/registry and packages/domain. No tenant schema change or alternate tenant registry.
Optional bot setup becomes a subsequent existing ENABLE_MODULE job; core provisioning owns ACTIVE.

## Success Criteria

- **SC-001**: No per-tenant DNS/TLS/provider registration or manual domain approval in the tested flow.
- **SC-002**: A valid administrator reaches their own working panel with no operator repair.
- **SC-003**: Record actual automatic and human-inclusive durations. The earlier proposed 30-second
  target is an evaluation reference, not an unmeasured guarantee or statistical acceptance claim.
- **SC-004**: Focused recovery/isolation checks and one independent review pass; deployed old/new
  addresses are verified before claiming completion.

## Verification Scope

High risk: routing/auth, provisioning transactions and recovery. Require gateway transport tests,
real PostgreSQL provisioning tests, two-tenant API invariants, affected type/lint/build checks, release
integration tests, one independent review and real browser desktop/mobile creation/onboarding.
CI remains the full integration gate. No production employee actions are authorized or needed.
