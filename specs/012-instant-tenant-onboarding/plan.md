# Implementation Plan: Instant tenant onboarding

**Change**: 012-instant-tenant-onboarding | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)
**Baseline**: 752387e | **Checkout**: master
**Engineering memory**: [Multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md)

## Summary

One wildcard Cloudflare Worker serves the existing Vite outputs and proxies API requests to the fixed
Railway HTTPS origin. Reuse the authoritative host registry, isolated databases, durable jobs and
welcome flow. Enable the gateway only after a public readiness check; retain old explicit hosts.

## Technical Context

Nest 11/Fastify 5, TypeScript 5.9, React 19/Vite 7, Vitest 3, PostgreSQL testcontainers, Drizzle,
Cloudflare Wrangler 4.129.0. The gateway uses Web APIs with a small local environment interface;
no new application framework. Static outputs are packaged under panel/ and kiosk/ in one asset set.
No frontend state or FSD migration is required for transport changes; existing Control owns forms.

## Constitution Check

PASS: master only; root is sole writer/index owner for this change; other-session bonus edits are
excluded. Preserve tenant isolation, domain FSM/history, framework boundaries and trilingual UI.
No new prohibited React hooks. Real database regression checks and independent review are required.
No extension hooks are installed. Shared feature pointer remains untouched while another feature is
active: helpers receive SPECIFY_FEATURE_DIRECTORY explicitly, per the project guide.

## DESIGN: Ownership and Behavior

- apps/tenant-gateway: wildcard route, platform/legacy bypass, routing by validated public config,
  fixed origin API proxy and assets. Worker-first asset routing; requests cannot choose an origin.
  Strip client forwarding/gateway headers, authenticate original host over the protected origin
  channel. Secrets never enter responses, logs, static assets or source. Normal TLS checks remain on.
- apps/api/src/infra: validate gateway credentials before trusting the original hostname; restore
  the effective Host for existing tenancy/auth/CORS. Bound refresh-on-miss to prevent reload floods.
  Direct legacy host traffic stays compatible. Unknown/suspended hosts remain closed.
- control provisioning: gateway mode validates HTTPS readiness of generated managed hosts and only
  then verifies them. Legacy manual mode remains the default until infrastructure is ready. Automatic
  transient retries have bounded attempts/delays and persisted attempt evidence. Core provision
  creates the administrator and activates; optional bot connection uses an independent existing job.
  Completion and follow-up job enqueue commit together. Public config refreshes on known completion.
- No duplicate registry/KV sync. Gateways never cache authenticated API responses. Registry remains
  authoritative for tenant identity/modules; public configuration uses no-store.
- Reserved names/generated hostname collisions must be rejected before provider or database work.

## Project Structure and Allowed Files

Root owns specs/012-instant-tenant-onboarding/**, apps/tenant-gateway/**, API infra tenant hook/runtime
and gateway helper/tests, API config, control provisioning/config/public refresh code and tests,
packages/domain tenant validation/tests if required, .railway/railway.ts, .github/workflows/ci.yml,
scoped release scripts/tests, pnpm-lock.yaml, existing multi-tenant product/engineering docs and
platform operations runbook. No changes to other tasks' bonus or analytics work. Shared documents
are updated only after coordination. No PR, branch or worktree.

## Applicable Skills

speckit-specify, speckit-plan, speckit-tasks, speckit-analyze, speckit-implement and speckit-converge;
architecture-patterns for boundaries; nestjs-best-practices for backend; javascript-testing-patterns
for focused regressions; browser verification guidance for live acceptance. Research agents are
read-only; one independent review receives the fixed integrated diff before delivery.

## IMPLEMENT: Ordered Delivery

1. Lock requirements and research gateway/provider constraints.
2. Implement/test gateway and secure API host handling, then automatic provisioning and independent bot.
3. Add CI asset packaging/deployment with a separate scoped Workers credential; preserve Pages paths
   for existing tenants/landing/control during rollout and existing Telegram release announcements.
4. Validate locally and independently review; commit only owned paths, push master normally.
5. Deploy backend trust config before gateway, verify gateway on a test hostname, enable wildcard and
   control automatic mode only after TLS/proxy checks. Do not create per-tenant provider records.
6. Complete the real browser benchmark and record evidence once.

## VERIFY and HARDEN

Gateway Vitest tests: spoof stripping, reserved/unknown hosts, surface assets, API body/cookie/stream
preservation and failure responses. API two-tenant real-DB suite: untrusted forwarding rejected,
auth trusted host valid, cross-tenant session/device isolation, refresh visibility. Control real-DB
suite: automatic HTTPS gate, failure/retry/restart, independent bot, administrator usable without DNS
pause. Run affected pnpm typecheck/build and ESLint, release script tests, format on owned files.
Independent review checks trust boundary, jobs and rollout. CI supplies broad integration checks.
Production: normal certificate checks, legacy reads, new QA company via authenticated Control,
welcome/password/first panel and kiosk shell; inspect desktop/390px screenshots. Record timings,
manual interactions, failures and cleanup disposition. A single run does not establish p95.

## REPORT and Documentation

Update the existing product doc/runbook/engineering memory; tasks link those actual results.
Separate local, CI, deployment and authenticated browser evidence. Record access gaps instead of
claiming deployment from source or certificates from a DNS-only probe.

## Open Decisions

Optional owner choice on public self-registration is pending; core infrastructure work is independent.
Provider DNS/Workers CI credential permissions must be verified before rollout. No payment purchase
or deletion of existing resources is necessary. The test tenant may be retained clearly labeled and
suspended after measurement if safe automated deletion is unavailable.

## Owner correction: outstanding bot setup

Control Tasks derives the missing-token requirement from the current enabled modules and secret
presence. Merge the latest persisted result for each step into one current checklist, retaining
its real job ID for actions. Include a gray expandable missing-token row in the same list and
progress, with a link to the existing Bot form. Historical jobs remain unchanged in the API.
Reuse the current workspace structure; do not invent a database job or mutate completed history.
Token save already starts the real connection job and refreshes both tenant detail and jobs.
Scope additionally includes control-web workspace/job model/tests and the three control catalogs.
