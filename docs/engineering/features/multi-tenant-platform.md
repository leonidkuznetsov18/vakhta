# Multi-tenant platform engineering memory

## Outcome and scope

2026-09-21; active feature `specs/011-multi-tenant-control-plane`, baseline `0566952`, current
`master` checkout. Owner request: each client plant gets its own database, bot, kiosk and branded
interface, created from a platform control panel that assigns modules. This entry records the
planning package; no code, schema, deployment or employee record changed.

## Current behavior and ownership

Single-customer deployment: one `DATABASE_URL`, one bot token, one panel and kiosk host, one
migration and backup target. Facts and file references: spec RECON. Product document:
[Multi-tenant platform](../../features/multi-tenant-platform.md) (planned).

## Decisions and reuse

- Isolation model: database per tenant on a shared cluster, shared stateless API and worker with
  an `AsyncLocalStorage` tenant context that fails closed, one bot per tenant, tenant hostnames,
  prefixed storage and Redis keys. Rejected: one deployment per tenant (cost, deploy per client)
  and `tenant_id` columns (contradicts the requirement, access risk). ADR-0015 (proposed).
- Control plane: separate `control-api` service and `control-web` app with their own registry
  database, operator auth with mandatory TOTP, encrypted tenant secrets, durable resumable
  provisioning jobs, append-only control audit. Provider tokens never enter the tenant API process.
- Compatibility: `TENANCY_MODE=env` keeps the pilot, local development and CI unchanged until the
  registry cutover; rollback is an env change with no data movement.
- Panel and kiosk remain single builds and read tenant configuration at runtime by host from a
  public control endpoint with a browser-storage cache.
- Modules `ADMIN_PANEL`, `WORKER_BOT`, `QR_KIOSK` are registry switches enforced by the API;
  `SUPPORT_BOT` and `PHOTO_INSPECTION` are reserved codes.
- Telegram offers no bot-creation API; operators paste BotFather tokens, validated with `getMe`.
- Owner refinement, 2026-09-21: the control panel is the single configuration surface with full
  create, edit and delete; creation is one wizard that ends with an onboarding link. Consequences
  recorded in the spec (US7, US8): section-18 parameters move from environment variables to a
  per-tenant settings catalog with platform defaults (the `settings` table exists but is used only
  by the support bot today); no mail provider exists, so links are copied, not e-mailed; deletion
  gets slug confirmation, a final backup and a retention window.
- Open owner decisions are listed in plan.md (hostname scheme, separate control service, one
  cluster, pilot slug, control panel languages).

## Delivery 1 implementation decisions (2026-09-21)

- `packages/registry` owns the control schema (tenants, branding, modules, domains, encrypted
  secrets, append-only control audit), its migrations, AES-256-GCM `SecretCipher` with key
  versions, `TenantRuntimeConfig`, `EnvTenantSource` and `RegistryTenantSource` (snapshot refreshed
  by `max(updated_at)` and row count). `registerExistingTenant` and the `register-tenant` CLI cover
  the pilot cutover; drizzle-kit loads the schema through CommonJS, so enum arrays mirror the domain
  constants with a test asserting equality.
- The API binds tenants with `AsyncLocalStorage`: a Fastify `onRequest` hook (registered before
  routes by `bindTenancy`) resolves the tenant by host and runs the request inside its context. The
  global `DATABASE`, `AUTH`, `AUTH_CONFIG`, `SHORT_TERM_STORE` and `KIOSK_OPTIONS` tokens are late-bound
  proxies over the current tenant runtime; without a context they throw `TENANT_CONTEXT_MISSING`,
  except for framework inspection keys (Nest lifecycle discovery, `then`, inspection symbols) that
  answer "absent". Verified end to end by the existing access-boundary e2e suite (env mode) and the
  new two-tenant isolation suite (registry mode).
- The env tenant has the fixed id `00000000-0000-4000-8000-000000000001`, slug `default`, no Redis
  or storage prefix, and answers every host, which keeps the pilot, local development and CI
  unchanged. Registry tenants get `t:<id>:` Redis keys and `tenants/<slug>/` media keys.
- Change buses (`ShiftChanges` and the handover, request and incident buses) tag events with the
  producing tenant; `stream()` filters by the caller's tenant, `streamAll()` serves process-wide
  subscribers that re-enter the context (the home-screen pusher keys by tenant and employee).
- Background loops (bonus recovery and dispatch, month close, avatar cleanup, shift auto-close,
  metrics scrape) visit every serving tenant sequentially through `TenantRuntimeRegistry.forEachActive`;
  one tenant's failure is logged and never stops the others.
- Telegram: one grammY bot per tenant with a token, reconciled on every registry refresh; webhook
  paths `/telegram/webhook` (host-bound tenant) and `/telegram/webhook/:tenantId` (must match);
  polling handlers run inside the owning tenant's context. The support bot binds to the env tenant
  or to `SUPPORT_TENANT_SLUG` in registry mode.
- Worker: `TenantWorkerPool` runs one media, inspection and timer runner plus outbox relay per
  serving tenant and restarts a worker when its secrets or hosts change; legacy BullMQ jobs carry
  an optional `tenantId` (required in registry mode; env mode maps it to the only tenant).
- `packages/db` exports `seedTenantDefaults` (first site, DAY/NIGHT templates, positions, reason
  codes) and `migrateTenantDatabase`; `migrate-tenants.js` is the Railway pre-deploy command.
- Provider facts marked **verify** in research.md remain unverified; env mode does not depend on
  them and no hostname automation was built yet.

## Verification

2026-09-21, local checkout after the delivery-1 changes (baseline `758ec91`), Colima Docker:

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:architecture`,
  `pnpm api:check`: pass.
- `packages/registry`: 13 tests (secrets round-trip and rotation, env source, enum mirror,
  registration with encrypted secrets and audit, duplicate slug/reserved slug/duplicate bot token
  refusal, snapshot by host/id/slug, refresh on `updated_at`, append-only audit for the app role).
- `packages/domain`: tenant rules incl. a property test on slug suggestion; `packages/contracts`: 17.
- `apps/api`: full suite 50 files / 450 tests in env mode, plus `infra/tenancy.e2e.test.ts` with
  two real tenant databases in registry mode: unknown host 404, cross-tenant cookie 401, cross-tenant
  device token 401, webhook host/secret checks, CORS per tenant, proxy without context throws,
  suspended tenant 403 after refresh (7 tests).
- `apps/worker`: 14 files / 142 tests.
- Not done: independent review (T017), pilot cutover and live QA (T018), provider fact checks (T010).
  No production variable, deployment or employee record changed.

## Prototype

2026-09-21: [clickable prototype](https://claude.ai/artifact/L1PPyJSknGCxWZYR7Ffm72) (private Claude Design artifact; share from its page to
show others). Six artboards: architecture, tenant list, quick-create form, live provisioning with
onboarding link and a manual DNS step, tenant workspace with switchable tabs (overview, modules,
database, bot, kiosk, parameters, danger zone), welcome page at phone width. Data on the screens is
invented; the artifact fixes screen structure and flow, not final visual design. The owner reviewed
it and told implementation to proceed; decisions delegated to the recommended defaults are recorded
in #92.

## GitHub publication

2026-09-21, on owner request: epic [#91](https://github.com/leonidkuznetsov18/vakhta/issues/91) with fifteen native sub-issues #92–#106, label
`area:platform` created, one status label per issue (`status:needs-decision` on the epic and #92,
`status:backlog` elsewhere). Titles follow `Platform | Capability | Outcome`; bodies carry outcome,
scope, acceptance checkboxes with AC/FR traceability, resolved dependency numbers, verification and
pinned sources. Receipts with body hashes: `specs/011-multi-tenant-control-plane/publication.json`.

## Remaining work

Delivery 1 code is in master (T011–T016). Next: independent review of the tenant-context boundary,
secrets handling and migrator (#97, T017), the provider fact checks (#92, T010), then the pilot
cutover with live QA (T018). Delivery 2 (#98–#101) starts after the cutover is verified.
Provisioning time per tenant is to be measured when the first non-pilot tenant is created (#104).
