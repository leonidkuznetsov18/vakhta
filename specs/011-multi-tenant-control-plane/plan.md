# Implementation Plan: Multi-tenant platform and control panel

**Change**: 011-multi-tenant-control-plane | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)
**Baseline**: 0566952 | **Checkout**: master
**Engineering memory**: [Multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md)

## Summary

Introduce a control registry (its own database and package), bind every API request and worker
unit of work to one tenant through an `AsyncLocalStorage` context, and keep the tenant schema
unchanged. Add a separate control service and control web app where operators create tenants,
assign modules and run provisioning jobs. The pilot becomes tenant one by registry data. The panel
and kiosk stay single builds that read their tenant configuration at runtime by host. Options and
rejected alternatives: [research.md](research.md). Registry tables: [data-model.md](data-model.md).

## Technical Context

- Workspace: pnpm 10.9.0, Turborepo, TypeScript ESM, Vitest, fast-check, testcontainers.
- API: NestJS 11 on Fastify, Drizzle over postgres.js, better-auth with TOTP, grammY, BullMQ,
  ioredis, pino, Sentry. Worker: standalone TypeScript with BullMQ. Panel: React 19, Vite,
  TanStack Query and Router, Zustand, Tailwind, shadcn/ui. Kiosk: Vite vanilla. Recheck installed
  versions before implementation.
- Hosting: Railway (`api`, `worker`, Postgres 18, Redis 8.2), Cloudflare Pages (panel, kiosk,
  landing), Cloudflare DNS, R2 for media and backups, GitHub Actions for CI, release, images and
  Pages deploys. Provider credentials and their scopes: `docs/runbooks/platform-operations.md`.
- Reusable modules: `packages/db` client and migrator, `apps/api/src/infra/database.module.ts`,
  `apps/api/src/auth/*`, `apps/api/src/telegram/telegram.service.ts`, `apps/api/src/cli/*`,
  `apps/worker/src/main.ts` loops, `apps/api/src/infra/redis.module.ts` short-term store,
  `apps/admin-web/src/shared/api`, `apps/admin-web/src/shared/config`, `packages/i18n`.
- Boundaries preserved: Nest feature modules, pure domain package, standalone worker, vanilla
  kiosk, FSD in the panel and in the new control web app.

### Research tasks (before delivery 1 coding)

Resolve the **verify** rows in [research.md](research.md): Railway wildcard or per-host custom
domains through the public API; Cloudflare Pages custom domains through the API; TLS interaction
with proxied wildcard records; Railway Postgres connection budget and pooler availability;
`AsyncLocalStorage` propagation through Fastify hooks, Nest guards and SSE. Record outcomes in the
engineering memory and adjust the hostname automation step accordingly. Do not start the tenant
context implementation before the `AsyncLocalStorage` check.

## Constitution Check

- Correctness and recorded history: tenant schema, event log and audit stay unchanged; the control
  audit log is append-only; provisioning steps are durable and idempotent (I, IV).
- Repository-grounded design: reuses the existing client, migrator, auth config, pairing and
  bootstrap CLI; introduces one new package and two new apps with deliberate public APIs (II).
- Bounded specification: four deliveries, each a bounded change with its own evidence (III).
- Proportionate verification: access and migration risk classified; invariant tests on two real
  databases and one independent review per delivery; delivery 1 has no product QA (IV).
- Worker value and accessibility: no change to worker flows; control panel and tenant surfaces
  are trilingual and follow the admin panel UI rules (V).
- Hook policy: the panel and control web use TanStack Query for tenant config; no `useEffect`,
  `useMemo`, `useRef` or `useCallback` in application code.
- Gaps: none demonstrated. Post-design recheck after research tasks; a wildcard-domain limitation
  would change one provisioning step, not the design.

## DESIGN: Ownership and Behavior

### Topology

```text
control.vakhta.xyz ─► control-web (Pages) ─► control-api (Railway) ─► vakhta_control (registry)
                                                    │ provider adapters: Postgres admin, Cloudflare, Railway, Telegram
<slug>.vakhta.xyz (panel) ─┐
<slug>-kiosk.vakhta.xyz ───┼─► <slug>-api.vakhta.xyz ─► api (shared) ─► vakhta_t_<slug>
Telegram webhook ──────────┘   /telegram/webhook/<tenantId>
                                                   worker (shared) ─► every ACTIVE tenant
```

Both `api` and `worker` read the registry through `CONTROL_DATABASE_URL` (a read-only role) and
decrypt tenant secrets with `CONTROL_ENCRYPTION_KEY`. Only `control-api` holds the cluster admin
URL and provider tokens.

### packages/registry (new)

Drizzle schema of the control database, its own `drizzle/` migrations and `migrate.ts`,
`createRegistry(url)`, `TenantRegistryReader` (in-memory snapshot, refresh every `REGISTRY_REFRESH_SECONDS`
by `max(updated_at)` and immediately on the Redis channel `control:registry`), `decryptSecret`,
`tenantFromEnv(env)` for `TENANCY_MODE=env`, and the internal `TenantRuntimeConfig` type. No Nest,
grammY or React imports: the worker, the CLI and both APIs consume it.

### Tenant context in the API

- `apps/api/src/infra/tenant-context.ts`: `AsyncLocalStorage<TenantRuntime>`, `runWithTenant`,
  `currentTenant()` that throws `DomainError('TENANT_CONTEXT_MISSING')` when empty.
- `TenantRuntime` per tenant, created lazily and cached in `TenantRuntimeRegistry`: Drizzle client
  (`max` from `TENANT_POOL_MAX`, default 4), better-auth instance, grammY bot when a token exists,
  Redis key prefix `t:<tenantId>:`, storage prefix, enabled modules, branding. Evicted on suspend,
  secret rotation or registry removal; connections closed on eviction and shutdown.
- Fastify `onRequest` hook registered before `registerAuthRoutes`: strips the port from `host`,
  looks up `tenant_domains` (surface `API`, status `VERIFIED`), rejects unknown (404) and suspended
  (403) tenants, and wraps the rest of the request in `runWithTenant`. `/health` and `/metrics`
  bypass the lookup.
- `DATABASE` stays the injection token; its provider becomes a proxy whose property access resolves
  `currentTenant().db` and binds methods. `AUTH`, `REDIS` short-term store and the bot accessor get
  the same treatment. Non-request code paths in the API (module init loops, SSE broadcasters, the
  home pusher, polling handlers) are enumerated and wrapped explicitly; an invariant test asserts the
  proxy throws without context.
- CORS: `origin` becomes a function that allows the current tenant's verified `PANEL` and `KIOSK`
  hosts; `CORS_ORIGINS` remains the env-mode source.
- Module guard: `@RequiresModule(TenantModule.QR_KIOSK)` on kiosk and terminal admin routes,
  `WORKER_BOT` on activation, relink and webhook routes; disabled → 403 `MODULE_DISABLED`.
- Telegram: `TelegramService` keeps a map of bots by tenant; webhook route
  `/telegram/webhook/:tenantId` checks the tenant's secret header; polling mode starts one poller
  per tenant with a token. `set-webhook.ts` takes a tenant slug.
- `MeView.tenant` and `GET /public/tenant-config` (served by `control-api`; the tenant API also
  exposes `GET /tenant/config` for signed-in clients) carry slug, display name, logo, accent colour
  and modules.
- Observability: pino base and Sentry tags include `tenant`; metrics gain a bounded `tenant` label;
  no secret is logged (C7).

### Worker

`apps/worker/src/tenants/loop.ts` iterates `registry.activeTenants()` for each periodic loop
(outbox relay, communication dispatch, retention, recovery) with per-tenant handles from a cache
(`max: 2` per tenant). BullMQ queue names stay shared; every job schema in `packages/contracts`
gains `tenantId`; the processor resolves the runtime by id, rejects unknown or suspended tenants
and runs the handler inside `runWithTenant`. A failure in one tenant is reported with the tenant
tag and does not stop the loop. Timer recovery runs per tenant database. Media keys of new tenants
use the storage prefix; `storageKey` remains absolute in the row, so pilot keys keep working.

### control-api (new Nest app, `apps/control-api`)

Modules: `auth` (better-auth over `control_auth_*`, TOTP mandatory, no self sign-up, CLI
`bootstrap-operator`), `tenants`, `modules`, `domains`, `secrets`, `branding`, `provisioning`,
`audit`, `public`, `health`. Provisioning runs in-process: a poller claims `PENDING` jobs under
`pg_advisory_xact_lock(tenant_id)` and executes steps in `seq` order; each step is a small class
with `isDone()`, `run()` and idempotent side effects; a thrown error marks the step `FAILED` with
`attempts++` and keeps the job resumable. Provider adapters sit behind interfaces
(`DatabaseProvisioner`, `HostnameProvider`, `BotWebhookProvider`); when a provider credential is
absent the step ends `MANUAL_REQUIRED` with instructions in `output`. Every write goes through a
transaction that also appends to `control_audit_log` and publishes `control:registry` after commit.

Steps: `CREATE_DATABASE` (create `vakhta_t_<slug>` and a per-tenant role; reuse only an empty
database), `MIGRATE` (drizzle migrator under advisory lock; records `schema_version`),
`SEED_DEFAULTS` (`seedTenantDefaults` exported from `packages/db`), `STORAGE_PREFIX`,
`REGISTER_DOMAINS` (insert managed hosts; provider adds DNS, Pages and Railway hostnames or asks
for manual action), `BOT_WEBHOOK` (`getMe`, `setWebhook` with secret), `INVITE_ADMIN` (create
`auth_user` and `ADMIN/ENTERPRISE` grant in the tenant database plus a single-use HMAC invitation,
TTL 72 hours, delivered as a link the operator copies).

### Tenant settings service

Operational parameters of spec section 18 leave the environment. `packages/contracts/src/tenant-settings.ts`
defines the key catalog as one `as const` object with a zod schema and platform defaults per key
(`presence.arriveBeforeMinutes`, `shift.graceMinutes`, `incident.slaNormalMinutes`, `qr.rotationSeconds`,
`media.retentionDays`, and the rest of the table in `docs/parameters.md`). `apps/api/src/config/tenant-settings.ts`
reads the tenant `settings` table (scope `global`) through the tenant context, merges defaults,
caches per tenant and invalidates on the Redis channel `control:settings:<tenantId>`; the worker
uses the same reader from `packages/registry`. Existing env keys remain the defaults for env mode
and for tenants without an override, so the pilot keeps its current values. `control-api` edits
these rows over the tenant database connection and audits the change; a later change may open a
subset to the tenant `ADMIN` in the tenant panel.

### Quick-create wizard, onboarding link and deletion

The wizard posts one `CreateTenantCommand` (name, slug, locale, timezone, modules, administrator
e-mail and name, optional bot token) and returns the job id; the job view polls steps. The
`INVITE_ADMIN` step creates the administrator and a `tenant_invitations` row of kind `ONBOARDING`
(HMAC token, seven days, single use for password setup, reissuable). The link targets the tenant
panel host `/#/welcome/<token>`; the panel's welcome page (`apps/admin-web/src/pages/welcome`)
verifies the token through the public control API, bound to its verified panel host, sets the password, and renders the bot deep link with
a QR code and the kiosk pairing steps in the tenant's default locale with a language switch. When
no bot token exists yet, the page shows a "bot is being connected" state and the workspace shows
the pending step. Sharing is copy-to-clipboard and the platform share sheet; e-mail delivery waits
for a mail provider.

Deletion (owner decision, 2026-09-22): require a reason and atomically archive the client with
its durable `DELETE` job and audit record. The existing runner removes the webhook, evicts runtime,
drops the registered database and owned role, then purges tenant object prefixes. Completed
checkpoints survive retries; secrets are removed only after cleanup succeeds. Keep the archived
registry tombstone and audit/job history. No final backup or retention delay is introduced.

### control-web (new React app, `apps/control-web`)

FSD: `app/` (router, providers), `pages/tenants`, `pages/tenant-workspace`, `pages/modules-catalog`,
`pages/operators`, `pages/audit`, `features/quick-create-tenant`, `features/provision-tenant`,
`features/toggle-module`, `features/edit-module-config`, `features/edit-tenant-settings`,
`features/manage-domains`, `features/manage-secrets`, `features/manage-invitations`,
`features/delete-tenant`, `entities/tenant`, `entities/provisioning-job`, `shared/`.

Screens follow the [owner-reviewed prototype](https://claude.ai/artifact/L1PPyJSknGCxWZYR7Ffm72) of 2026-09-21 (structure and flow, not final
visual design). **Tenants** (table: name, slug, status, modules, health, last job; filters; quick-create button). **Quick create** (one form, then the live job view with the onboarding link and copy
buttons on success). **Tenant workspace** with tabs: Overview (status, health, addresses, pending
manual steps, onboarding link), Modules (cards with switch and config form), Database (host, name,
schema version, size, last backup, connection check, migrate and backup actions), Bot (username,
webhook status, token set/rotate, verify), Kiosk (address, QR settings, terminals count), Panel
(address, administrators, invitations, reissue), Domains (table with DNS status and verify),
Branding (name, logo, colour with preview), Parameters (grouped forms for the section-18 settings),
Jobs (history with steps), Audit (filtered log), Clients table actions (delete, suspend). **Modules
catalog**, **Operators**, **Audit**. Every form follows the disabled-until-changed rule; every
non-obvious control has a tooltip; one loader per surface; complete counts and pagination. shadcn
primitives are copied from the panel initially; a shared `packages/ui` is extracted only when
delivery 3 shows real duplication. TanStack Query owns server state; the provisioning job view
polls while a job is active. Texts live in a `control` namespace in all three catalogs. Admin panel
UI rules apply: disabled no-op actions, one loader per surface, tooltips for non-obvious controls,
mobile layouts, TableCount and Paginator.

### Panel and kiosk runtime configuration

`apps/admin-web/src/shared/config` and the kiosk bootstrap fetch
`${VITE_CONTROL_PUBLIC_URL}/public/tenant-config?host=<location.host>&surface=PANEL|KIOSK`, validate
with `TenantPublicConfig`, cache in `localStorage` under `vakhta.tenant-config`, and use the cache
when the fetch fails. `VITE_API_URL` stays the local-dev override. `VITE_CANONICAL_ORIGIN` is
replaced by the config's primary host. The panel shows the tenant display name and logo in the
sign-in card, header and document title; the kiosk in its title; the bot greeting reads the display
name from the runtime. A suspended tenant or disabled module renders a localized notice instead of
the app.

### Migrations, backups, deployment

- `packages/db/src/migrate.ts` gains `--tenants`: in registry mode it migrates every non-archived
  tenant sequentially under `pg_advisory_lock`, records `schema_version`, and exits non-zero naming
  the first failing tenant. Railway `preDeployCommand` for `api`: control migrate, then tenant
  migrate. `control-api` runs control migrate only.
- `.github/workflows/db-backup.yml` and `scripts/db/backup.sh` list databases on the cluster and
  dump the control database and each tenant database into `backups/<database>/<date>.dump`.
  The restore runbook gets a per-tenant section and a drill task.
- `.railway/railway.ts` adds the `control-api` service (own Dockerfile, same pattern), the wildcard
  or per-host API domains and the new env keys with `preserve()`. `ci.yml` adds `control-api` to
  the images matrix and `control-web` to the Pages job (`vakhta-control`).

### Pilot cutover and rollback

1. Deploy delivery 1 with `TENANCY_MODE=env` (no behavior change).
2. Create `vakhta_control`, run control migrations, run `control-api` CLI
   `register-existing-tenant` with the pilot slug, database URL, bot token, webhook secret and
   the three current hosts; verify the registry row.
3. Set `CONTROL_DATABASE_URL`, `CONTROL_ENCRYPTION_KEY` and `TENANCY_MODE=registry` on `api` and
   `worker`; redeploy; run `set-webhook` for the pilot (the path now carries the tenant id).
4. Verify the affected live journeys with the QA account; record evidence.
5. Rollback: restore `TENANCY_MODE=env` and the previous webhook path; no data changes either way.

### Local development and tests

`TENANCY_MODE=env` is the default in `.env.example`, so `pnpm infra:up`, seed and every existing
test keep working. `infra/compose` adds a `vakhta_control` database in the same Postgres for
delivery 2 work. A testcontainers helper `withTenants(n)` creates a control database and `n`
migrated tenant databases for isolation tests. Two-tenant fixtures are the basis of the invariant
suite in `apps/api/src/infra/tenant-context.test.ts` and `apps/worker/src/tenants/loop.test.ts`.

## Project Structure and Allowed Files

This planning task owns `specs/011-multi-tenant-control-plane/`, `.specify/feature.json`,
`docs/adr/0015-database-per-tenant-with-control-plane.md`, `docs/features/multi-tenant-platform.md`,
`docs/features/README.md` (planned-feature line), `docs/engineering/features/multi-tenant-platform.md`,
the new section in `docs/engineering/roadmap.md` and one entry in `.codex/memory.md`.

Delivery 1 owns `packages/registry/**`, `packages/contracts/src/tenant.ts` and job schemas,
`packages/domain/src/tenant/**`, `packages/db/src/{migrate,seed}.ts`, `apps/api/src/infra/*`,
`apps/api/src/config/env.ts`, `apps/api/src/main.ts`, `apps/api/src/auth/*`,
`apps/api/src/telegram/*`, `apps/api/src/cli/*`, `apps/worker/src/**`, `.env.example`,
`infra/compose/docker-compose.yml`, `.railway/railway.ts`, `.github/workflows/ci.yml`, and their
tests. Delivery 2 owns `apps/control-api/**`, `apps/control-web/**`, `packages/i18n` (`control`
namespace), `packages/contracts/src/tenant-settings.ts`, `apps/api/src/config/tenant-settings.ts`
and its call sites, and the workflow/IaC additions for them. Delivery 3 also owns
`apps/admin-web/src/pages/welcome/**`. Delivery 3 owns `apps/admin-web/src/shared/config`,
`apps/admin-web/src/app/**` header and navigation, `apps/qr-kiosk/src/main.ts`, bot screens and
i18n. Delivery 4 owns `.github/workflows/db-backup.yml`, `scripts/db/*`, `docs/runbooks/*` and the
provider adapters. Each delivery re-lists its exact files in tasks.md before coding.

One writer and index owner at a time in the current checkout on master; no PR, branch or worktree.

## Applicable Skills

Architecture and design: `architecture-patterns`, `architecture-decision-records`. Backend and
schema: `nestjs-best-practices`, `supabase-postgres-best-practices` (PostgreSQL guidance only).
Control web and panel changes: `vercel-react-best-practices`, `frontend-design`. QA:
`javascript-testing-patterns`, `webapp-testing`. Secrets, auth and isolation review:
`security-and-hardening`. No Lean review was requested.

## IMPLEMENT: Ordered Delivery

| Delivery            | Depends on              | Exit evidence                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Planning package | Repository recon        | This spec, plan, tasks, research, data model, ADR, product and engineering documents                                                                                                                                                                                |
| 1. Foundation       | Research tasks resolved | Registry package and migrations; tenant context in API and worker; `--tenants` migrator; env mode green in CI; pilot registered and cut over with recorded live checks                                                                                              |
| 2. Control panel    | Delivery 1              | Operator sign-in with TOTP; quick-create wizard; tenant workspace with all configuration tabs and inline actions; tenant settings service; provisioning job with resumable steps and onboarding link; audit; public config endpoint; desktop and mobile screenshots |
| 3. Tenant surfaces  | Delivery 2              | Second tenant provisioned end to end; per-tenant bot; module gating; branding on panel, kiosk and bot; runtime config with cache                                                                                                                                    |
| 4. Operations       | Delivery 3              | Multi-tenant backup and restore drill; suspend/resume; token rotation; client-owned domain flow; tenant health view; immediate physical deletion with a required reason                                                                                             |

No dates or effort figures are promised here; record actual provisioning time per tenant when the
first non-pilot tenant is created.

## VERIFY and HARDEN

| Acceptance  | Check                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001, 004 | control-api integration tests: slug validation, reserved list, immutability, token fingerprint uniqueness, redaction in responses and logs                             |
| AC-002      | Provisioning runner tests with a failing step, process restart mid-job, retry without repeating done steps, manual-required path                                       |
| AC-003      | Invitation test: single use, expiry, grant present in the tenant database; browser check on the tenant panel host                                                      |
| AC-005–010  | Isolation suite on two testcontainers tenant databases: unknown host, suspended tenant, cross-tenant cookie, device token, webhook secret, CORS, proxy without context |
| AC-011–013  | Existing suites in env mode; registry-mode suite with the pilot fixture; live QA of the listed journeys after cutover; rollback rehearsal on staging-like env          |
| AC-014–016  | Worker loop tests: one tenant failing does not stop others; job without `tenantId` rejected; recovery per tenant; media key prefix                                     |
| AC-017–020  | Module guard tests; panel and kiosk browser checks with a disabled module; runtime config fetch, validation failure and cache fallback                                 |
| AC-021–024  | Migrator test with a failing tenant; backup script dry run listing databases; restore drill record; suspend and rotation tests                                         |
| AC-025      | Audit tests: every mutation appends; UPDATE/DELETE on `control_audit_log` fails for the application role                                                               |
| AC-026–031  | Workspace browser checks per tab; settings reader tests (defaults, override, invalidation, pilot values unchanged); inline action tests; table standard checks         |
| AC-032–034  | Wizard and job view browser checks; invitation tests (single use, expiry, reissue); welcome page in three languages without a bot token and with one                   |
| AC-035      | Deletion tests: reason validation, immediate access block, physical database/file cleanup, isolation and retry                                                         |

Commands: `pnpm --filter @vakhta/registry test`, `pnpm --filter api test`, `pnpm --filter worker
test`, `pnpm --filter control-api test`, `pnpm check` before each delivery's commit. Independent
reviewer per delivery: a session other than the writer reviews the changed boundary (tenant
context, provisioning transactions, secrets handling). Live QA uses `dev@vakhta.xyz` and
`docs/runbooks/product-qa.md` for the pilot and the first new tenant only on changed surfaces.
Blocked checks are recorded honestly in the engineering memory.

## REPORT and Documentation

On each delivery: update `docs/features/multi-tenant-platform.md` from planned to current behavior
for the shipped part, `docs/features/11-admin-panel.md` and `03-attendance-qr-kiosk.md` where the
tenant surfaces change, `docs/runbooks/platform-operations.md` and `recovery.md` for the new
services and backups, `.env.example`, and the engineering memory with decisions, exact checks,
deployed versions and remaining work. Distinguish local checks, CI and release outcomes, and
verified deployed behavior.

## Open Decisions

1. **Hostname scheme**: resolved 2026-09-21 by provider research (research.md): one label under the
   zone, `<slug>.vakhta.xyz`, `<slug>-kiosk.vakhta.xyz`, `<slug>-api.vakhta.xyz`, so Universal SSL
   and one Railway wildcard cover them; patterns are control-api settings (`*_HOST_PATTERN`).
2. **Control plane as a separate Railway service** (recommended: provider secrets stay out of the
   tenant-serving process) versus the same process behind a host route (cheaper).
3. **One Postgres service for all tenants in v1** (recommended) versus one service per tenant.
4. **Pilot slug and display name** for the current customer.
5. **Control panel languages**: the trilingual rule applies by default; the owner may restrict the
   operator UI to fewer languages as an explicit exception.
6. **Deletion**: owner confirmed immediate physical database/file destruction on 2026-09-22.
7. **Which section-18 parameters the tenant's own `ADMIN` may edit later** in the tenant panel;
   in this program only operators edit them.

Everything else in this plan is a routine engineering choice that does not need owner input.
