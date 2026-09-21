# Tasks: Multi-tenant platform and control panel

**Input**: [spec.md](spec.md) and [plan.md](plan.md) in this change directory
**Authority**: owner request 2026-09-21; implementation starts after the plan's Open Decisions are confirmed
**Writer / index owner**: one session at a time in the current checkout | **Checkout**: master
**Evidence**: [Multi-tenant platform engineering memory](../../docs/engineering/features/multi-tenant-platform.md)

## Task Format and Rules

`- [ ] T001 [US1] Description with exact paths (covers AC-001)`. Dependencies are explicit. Tests
follow `docs/engineering/testing-baseline.md`: access, transactions, migrations and recovery need
invariant tests on real PostgreSQL and one independent review per delivery. No task is `[P]`;
writes are sequential. Deliveries 2–4 list their outcomes and acceptance mapping now and refine
exact files in this document before their own coding starts.

## Planning delivery (done)

- [x] T001 Inspect the current deployment topology, database binding, auth, bot, worker, migrations, backups and static builds (spec RECON).
- [x] T002 Compare isolation options and record the decision and provider facts to verify in research.md; draft the registry data model.
- [x] T003 Write spec.md, plan.md, this file, the requirements checklist, ADR-0015, the planned product document, the engineering memory, the roadmap section and the handoff entry; set `.specify/feature.json`.

## Delivery 1: Foundation (US2, US3, US4)

**Outcome**: every unit of work runs in a tenant context; env mode keeps CI and production
unchanged; the pilot is registered and cut over. **Acceptance**: AC-005–016, AC-021 (migrator part).

- [ ] T010 Resolve the research.md **verify** rows with official documentation and a small `AsyncLocalStorage` probe through Fastify hook → Nest guard → service → SSE; record results in the engineering memory. Blocks T012.
- [ ] T011 Create `packages/registry` (schema per data-model.md, `drizzle/` migrations, `migrate.ts`, `createRegistry`, `TenantRegistryReader`, `decryptSecret`, `tenantFromEnv`, `TenantRuntimeConfig`); add `packages/domain/src/tenant/` (statuses, modules, slug rules, reserved slugs, status FSM) with unit and property tests; add `TenantModule`, `TenantStatus`, `TenantPublicConfig` and `tenantId` job fields in `packages/contracts` (covers FR-001, FR-003).
- [ ] T012 Implement `apps/api/src/infra/tenant-context.ts`, `TenantRuntimeRegistry`, the `DATABASE`/`AUTH`/short-term-store proxies and the Fastify host hook in `apps/api/src/main.ts`; add `TENANCY_MODE`, `CONTROL_DATABASE_URL`, `CONTROL_ENCRYPTION_KEY`, `TENANT_POOL_MAX`, `REGISTRY_REFRESH_SECONDS` to `apps/api/src/config/env.ts` with production-readiness checks; enumerate and wrap non-request code paths (module init loops, SSE, home pusher). Depends on T010, T011 (covers AC-005, AC-006, AC-009, AC-010).
- [ ] T013 Make `TelegramService` multi-bot with `/telegram/webhook/:tenantId` and per-tenant secrets; polling per tenant in dev; update `apps/api/src/cli/set-webhook.ts` and `bootstrap-admin.ts` to take a tenant slug; tenant-scope the kiosk device token and QR challenge lookups (they already read through `DATABASE`; add tests). Depends on T012 (covers AC-007, AC-008).
- [ ] T014 Worker: `apps/worker/src/tenants/loop.ts`, per-tenant handle cache, `tenantId` in every job processor with rejection of unknown or suspended tenants, per-tenant recovery, media key prefix from the runtime; env additions in `apps/worker/src/env.ts`. Depends on T011 (covers AC-014, AC-015, AC-016).
- [ ] T015 `packages/db/src/migrate.ts --tenants` under `pg_advisory_lock` with `schema_version` recording; export `seedTenantDefaults` from `packages/db/src/seed.ts`; `.railway/railway.ts` preDeploy sequence and new env keys with `preserve()`; `.env.example` and `infra/compose` control database. Depends on T011 (covers AC-021 migrator part, AC-012).
- [ ] T016 Isolation suite with a testcontainers helper `withTenants(2)`: unknown host, suspended tenant, cross-tenant cookie, cross-tenant device token, webhook secret, CORS, proxy without context, worker loop isolation and job rejection; run existing suites in env mode. Depends on T012–T015 (covers SC-003, AC-012).
- [ ] T017 Independent review of the tenant-context boundary, secrets handling and migrator (reviewer is not the writer); resolve findings.
- [ ] T018 Cutover: deploy in env mode, create `vakhta_control`, register the pilot with the `register-existing-tenant` CLI, switch `api` and `worker` to registry mode, re-set the webhook, verify the listed live journeys with the QA account, record versions and evidence; rehearse rollback on a non-production environment first (covers AC-011, AC-013).

## Delivery 2: Control panel (US1 without bot and invite, AC-025)

**Outcome**: operators manage tenants and run provisioning jobs. **Acceptance**: AC-001, AC-002
(steps up to `REGISTER_DOMAINS`), AC-025, public config endpoint for AC-020.

- [ ] T020 `apps/control-api`: Nest app with operator better-auth (TOTP mandatory, no sign-up), `bootstrap-operator` CLI, tenants, modules, domains, branding, secrets (encrypted, fingerprint), audit, health and `GET /public/tenant-config`; Dockerfile; `.railway/railway.ts` service; `ci.yml` image.
- [ ] T021 Provisioning runner: job claim under advisory lock, step classes with `isDone`/`run`, `MANUAL_REQUIRED` path, `CREATE_DATABASE`, `MIGRATE`, `SEED_DEFAULTS`, `STORAGE_PREFIX`, `REGISTER_DOMAINS` with `HostnameProvider` adapters (Cloudflare, Railway, manual); tests for failure, restart, retry and idempotency.
- [ ] T022 `apps/control-web`: FSD app with tenant list, tenant detail (modules, domains, secrets, branding, jobs and steps, audit), create-tenant and provision features, operators page; `control` i18n namespace in uk/en/ru; Pages project `vakhta-control` in `ci.yml`.
- [ ] T023 Desktop and mobile screenshots of the control panel; independent review of auth, secrets and provisioning transactions; engineering memory update.

## Delivery 3: Tenant surfaces (US1 remainder, US5)

**Outcome**: a second tenant is usable end to end with its own bot and branding. **Acceptance**:
AC-003, AC-004, AC-017–020.

- [ ] T030 `BOT_WEBHOOK` and `INVITE_ADMIN` steps; token validation with `getMe`; invitation flow on the tenant panel (`#/invite/<token>`), single use and expiry tests.
- [ ] T031 Module guard on kiosk, terminal, activation, relink and webhook routes; `MeView.tenant`; panel navigation and action gating with tooltips; kiosk notice screen; bot greeting with the display name; i18n in three catalogs.
- [ ] T032 Runtime configuration in `apps/admin-web/src/shared/config` and the kiosk bootstrap: fetch, zod validation, `localStorage` cache, fallback, canonical host from config; remove `VITE_CANONICAL_ORIGIN` usage; keep `VITE_API_URL` for local dev.
- [ ] T033 Provision the first non-pilot tenant end to end; record provisioning time; browser checks on panel, kiosk and bot for both tenants; independent review; documentation updates.

## Delivery 4: Operations (US6)

**Outcome**: the platform is operable for many tenants. **Acceptance**: AC-021 (control panel
view), AC-022, AC-023, AC-024, client-owned domains.

- [ ] T040 Multi-database backup in `scripts/db/backup.sh` and `db-backup.yml`; per-tenant restore section in `docs/runbooks/recovery.md`; one restore drill into a scratch database with recorded evidence.
- [ ] T041 Suspend and resume jobs with runtime eviction and worker skip; bot token rotation job; tenant health and schema version in the control panel.
- [ ] T042 Client-owned domain registration and verification (`PENDING` → `VERIFIED`), TLS and DNS instructions, API serving only verified hosts; tests.
- [ ] T043 Runbook updates (`platform-operations.md`, new `tenant-operations.md`), independent review, engineering memory and product document updates.

## Delivery and Evidence

- [ ] T050 After each delivery: update the product document for shipped behavior, the engineering memory with decisions, exact checks, deployed versions and limitations, and `.env.example`.
- [ ] T051 After each delivery: inspect task-owned changes, run the remaining required checks, and deliver one coherent commit and push through the existing master CI, release and announcement path.

## Dependencies and Handoff

T010 → T012; T011 → T012, T014, T015; T012 → T013; T012–T015 → T016 → T017 → T018. Delivery 2 starts
after T018 is verified in production. Delivery 3 needs T021 and T022. Delivery 4 needs T033. Owned
files per delivery are listed in plan.md and re-listed here before coding. Next action: owner
confirms the plan's Open Decisions; then T010.

## Convergence

After each delivery compare the code with spec.md and plan.md, append demonstrated gaps as new
numbered tasks and preserve completed history. A changed requirement updates spec.md and plan.md
before new work. No unaccepted expansion (impersonation, billing, additional modules, tenant data
deletion) is implemented under this change.
