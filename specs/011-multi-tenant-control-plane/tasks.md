# Tasks: Multi-tenant platform and control panel

**Input**: [spec.md](spec.md) and [plan.md](plan.md) in this change directory
**Authority**: owner request 2026-09-21; implementation starts after the plan's Open Decisions are confirmed
**Writer / index owner**: one session at a time in the current checkout | **Checkout**: master
**Evidence**: [Multi-tenant platform engineering memory](../../docs/engineering/features/multi-tenant-platform.md)

## GitHub publication

Epic: [#91](https://github.com/leonidkuznetsov18/vakhta/issues/91). GitHub is the live authority for issue state; the checkboxes below remain the
task-level record. Receipts: [publication.json](publication.json). Published 2026-09-21.

| Issue                                                          | Capability and outcome      | Source tasks                                                                      | Delivery         |
| -------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| [#92](https://github.com/leonidkuznetsov18/vakhta/issues/92)   | Decisions and research      | Confirm hostnames control service cluster and verify provider facts               | T010             | Delivery 1 |
| [#93](https://github.com/leonidkuznetsov18/vakhta/issues/93)   | Registry                    | Build the control registry package domain rules and tenant contracts              | T011             | Delivery 1 |
| [#94](https://github.com/leonidkuznetsov18/vakhta/issues/94)   | Tenant context              | Bind every API request auth and bot to one tenant                                 | T012, T013       | Delivery 1 |
| [#95](https://github.com/leonidkuznetsov18/vakhta/issues/95)   | Worker isolation            | Run outbox timers media and recovery per tenant                                   | T014             | Delivery 1 |
| [#96](https://github.com/leonidkuznetsov18/vakhta/issues/96)   | Migrations and environments | Migrate every tenant database and keep env mode working                           | T015             | Delivery 1 |
| [#97](https://github.com/leonidkuznetsov18/vakhta/issues/97)   | Foundation acceptance       | Prove isolation with two databases and cut the pilot over                         | T016, T017, T018 | Delivery 1 |
| [#98](https://github.com/leonidkuznetsov18/vakhta/issues/98)   | Control service             | Provide operator authentication registry APIs and resumable provisioning          | T020, T021       | Delivery 2 |
| [#99](https://github.com/leonidkuznetsov18/vakhta/issues/99)   | Tenant settings             | Move operational parameters from environment to per-tenant settings               | T023             | Delivery 2 |
| [#100](https://github.com/leonidkuznetsov18/vakhta/issues/100) | Quick creation              | Create a client in one form and hand over an onboarding link                      | T024             | Delivery 2 |
| [#101](https://github.com/leonidkuznetsov18/vakhta/issues/101) | Control panel               | Show and edit every tenant configuration in one workspace                         | T022, T025, T026 | Delivery 2 |
| [#102](https://github.com/leonidkuznetsov18/vakhta/issues/102) | Bot and welcome             | Connect the tenant bot and let the administrator start from one link              | T030             | Delivery 3 |
| [#103](https://github.com/leonidkuznetsov18/vakhta/issues/103) | Modules and branding        | Enforce module switches and show the client identity on every surface             | T031             | Delivery 3 |
| [#104](https://github.com/leonidkuznetsov18/vakhta/issues/104) | Runtime configuration       | Resolve panel and kiosk configuration by host and onboard the first new client    | T032, T033       | Delivery 3 |
| [#105](https://github.com/leonidkuznetsov18/vakhta/issues/105) | Backups and lifecycle       | Back up every tenant suspend resume and rotate bot tokens                         | T040, T041       | Delivery 4 |
| [#106](https://github.com/leonidkuznetsov18/vakhta/issues/106) | Domains and deletion        | Verify client domains and delete tenants with a final backup and retention window | T042, T043, T044 | Delivery 4 |

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
- [x] T004 Build the [clickable prototype](https://claude.ai/artifact/L1PPyJSknGCxWZYR7Ffm72) (six artboards: architecture, tenant list, quick create, provisioning job with onboarding link, workspace tabs, welcome page); owner reviewed it on 2026-09-21 and authorized implementation to start.

## Delivery 1: Foundation (US2, US3, US4)

**Outcome**: every unit of work runs in a tenant context; env mode keeps CI and production
unchanged; the pilot is registered and cut over. **Acceptance**: AC-005–016, AC-021 (migrator part).

- [ ] T010 (partial: the `AsyncLocalStorage` probe is covered by the isolation suite; provider rows remain open) Resolve the research.md **verify** rows with official documentation and a small `AsyncLocalStorage` probe through Fastify hook → Nest guard → service → SSE; record results in the engineering memory. Blocks T012.
- [x] T011 Create `packages/registry` (schema per data-model.md, `drizzle/` migrations, `migrate.ts`, `createRegistry`, `TenantRegistryReader`, `decryptSecret`, `tenantFromEnv`, `TenantRuntimeConfig`); add `packages/domain/src/tenant/` (statuses, modules, slug rules, reserved slugs, status FSM) with unit and property tests; add `TenantModule`, `TenantStatus`, `TenantPublicConfig` and `tenantId` job fields in `packages/contracts` (covers FR-001, FR-003).
- [x] T012 Implement `apps/api/src/infra/tenant-context.ts`, `TenantRuntimeRegistry`, the `DATABASE`/`AUTH`/short-term-store proxies and the Fastify host hook in `apps/api/src/main.ts`; add `TENANCY_MODE`, `CONTROL_DATABASE_URL`, `CONTROL_ENCRYPTION_KEY`, `TENANT_POOL_MAX`, `REGISTRY_REFRESH_SECONDS` to `apps/api/src/config/env.ts` with production-readiness checks; enumerate and wrap non-request code paths (module init loops, SSE, home pusher). Depends on T010, T011 (covers AC-005, AC-006, AC-009, AC-010).
- [x] T013 Make `TelegramService` multi-bot with `/telegram/webhook/:tenantId` and per-tenant secrets; polling per tenant in dev; update `apps/api/src/cli/set-webhook.ts` and `bootstrap-admin.ts` to take a tenant slug; tenant-scope the kiosk device token and QR challenge lookups (they already read through `DATABASE`; add tests). Depends on T012 (covers AC-007, AC-008).
- [x] T014 Worker: `apps/worker/src/tenants/loop.ts`, per-tenant handle cache, `tenantId` in every job processor with rejection of unknown or suspended tenants, per-tenant recovery, media key prefix from the runtime; env additions in `apps/worker/src/env.ts`. Depends on T011 (covers AC-014, AC-015, AC-016).
- [x] T015 `packages/db/src/migrate.ts --tenants` under `pg_advisory_lock` with `schema_version` recording; export `seedTenantDefaults` from `packages/db/src/seed.ts`; `.railway/railway.ts` preDeploy sequence and new env keys with `preserve()`; `.env.example` and `infra/compose` control database. Depends on T011 (covers AC-021 migrator part, AC-012).
- [x] T016 Isolation suite with a testcontainers helper `withTenants(2)`: unknown host, suspended tenant, cross-tenant cookie, cross-tenant device token, webhook secret, CORS, proxy without context, worker loop isolation and job rejection; run existing suites in env mode. Depends on T012–T015 (covers SC-003, AC-012).
- [ ] T017 Independent review of the tenant-context boundary, secrets handling and migrator (reviewer is not the writer); resolve findings.
- [ ] T018 Cutover: deploy in env mode, create `vakhta_control`, register the pilot with the `register-existing-tenant` CLI, switch `api` and `worker` to registry mode, re-set the webhook, verify the listed live journeys with the QA account, record versions and evidence; rehearse rollback on a non-production environment first (covers AC-011, AC-013).

## Delivery 2: Control panel (US1 without bot and invite, AC-025)

**Outcome**: operators create tenants in one form, see and edit every configuration in one place,
and hand over an onboarding link. **Acceptance**: AC-001, AC-002 (steps up to `REGISTER_DOMAINS`),
AC-025, AC-026–032, AC-034, public config endpoint for AC-020.

- [ ] T020 `apps/control-api`: Nest app with operator better-auth (TOTP mandatory, no sign-up), `bootstrap-operator` CLI, tenants, modules, domains, branding, secrets (encrypted, fingerprint), audit, health and `GET /public/tenant-config`; Dockerfile; `.railway/railway.ts` service; `ci.yml` image.
- [ ] T021 Provisioning runner: job claim under advisory lock, step classes with `isDone`/`run`, `MANUAL_REQUIRED` path, `CREATE_DATABASE`, `MIGRATE`, `SEED_DEFAULTS`, `STORAGE_PREFIX`, `REGISTER_DOMAINS` with `HostnameProvider` adapters (Cloudflare, Railway, manual); tests for failure, restart, retry and idempotency.
- [ ] T022 `apps/control-web`: FSD app with tenant list, tenant detail (modules, domains, secrets, branding, jobs and steps, audit), create-tenant and provision features, operators page; `control` i18n namespace in uk/en/ru; Pages project `vakhta-control` in `ci.yml`.
- [ ] T023 Tenant settings: `packages/contracts/src/tenant-settings.ts` key catalog with defaults, `apps/api/src/config/tenant-settings.ts` reader with cache and Redis invalidation, worker reader in `packages/registry`, replace env reads at their call sites, control-api endpoints to read and write tenant settings; tests for defaults, override, invalidation and unchanged pilot values (covers AC-028).
- [ ] T024 Quick-create wizard, live job view and onboarding link: `CreateTenantCommand`, `tenant_invitations`, reissue endpoint, copy buttons, share sheet; tests for single use, expiry and reissue (covers AC-032–034).
- [ ] T025 Tenant workspace tabs with inline actions (connection check, migrate, backup, verify bot, re-register webhook, verify domain, reissue invitation), module cards with config forms, modules catalog, operators and audit pages; admin panel table standard (covers AC-026, AC-027, AC-029–031).
- [ ] T026 Desktop and mobile screenshots of the tenant list, wizard, job view and every workspace tab; independent review of auth, secrets, settings writes and provisioning transactions; engineering memory update.

## Delivery 3: Tenant surfaces (US1 remainder, US5)

**Outcome**: a second tenant is usable end to end with its own bot and branding. **Acceptance**:
AC-003, AC-004, AC-017–020.

- [ ] T030 `BOT_WEBHOOK` and `INVITE_ADMIN` steps; token validation with `getMe`; trilingual welcome page on the tenant panel (`#/welcome/<token>`): password setup, bot deep link with QR, kiosk pairing steps, "bot is being connected" state; tests (covers AC-003, AC-033, AC-034).
- [ ] T031 Module guard on kiosk, terminal, activation, relink and webhook routes; `MeView.tenant`; panel navigation and action gating with tooltips; kiosk notice screen; bot greeting with the display name; i18n in three catalogs.
- [ ] T032 Runtime configuration in `apps/admin-web/src/shared/config` and the kiosk bootstrap: fetch, zod validation, `localStorage` cache, fallback, canonical host from config; remove `VITE_CANONICAL_ORIGIN` usage; keep `VITE_API_URL` for local dev.
- [ ] T033 Provision the first non-pilot tenant end to end; record provisioning time; browser checks on panel, kiosk and bot for both tenants; independent review; documentation updates.

## Delivery 4: Operations (US6)

**Outcome**: the platform is operable for many tenants. **Acceptance**: AC-021 (control panel
view), AC-022, AC-023, AC-024, AC-035, client-owned domains.

- [ ] T040 Multi-database backup in `scripts/db/backup.sh` and `db-backup.yml`; per-tenant restore section in `docs/runbooks/recovery.md`; one restore drill into a scratch database with recorded evidence.
- [ ] T041 Suspend and resume jobs with runtime eviction and worker skip; bot token rotation job; tenant health and schema version in the control panel.
- [ ] T042 Client-owned domain registration and verification (`PENDING` → `VERIFIED`), TLS and DNS instructions, API serving only verified hosts; tests.
- [ ] T043 Tenant deletion: slug confirmation, `FINAL_BACKUP`, suspension, `tenant_deletions` with retention window, restore within the window, scheduled `DROP_DATABASE` and `DROP_STORAGE`; tests (covers AC-035).
- [ ] T044 Runbook updates (`platform-operations.md`, new `tenant-operations.md`), independent review, engineering memory and product document updates.

## Delivery and Evidence

- [ ] T050 After each delivery: update the product document for shipped behavior, the engineering memory with decisions, exact checks, deployed versions and limitations, and `.env.example`.
- [ ] T051 After each delivery: inspect task-owned changes, run the remaining required checks, and deliver one coherent commit and push through the existing master CI, release and announcement path.

## Dependencies and Handoff

2026-09-21: T011–T016 implemented and verified locally (see the engineering memory); T017 review and
T018 cutover are the next actions, T010 provider checks stay open.

T010 → T012; T011 → T012, T014, T015; T012 → T013; T012–T015 → T016 → T017 → T018. Delivery 2 starts
after T018 is verified in production; inside it T020 → T021 → T023 → T024 → T025 → T026. Delivery 3
needs T021–T025. Delivery 4 needs T033. Owned
files per delivery are listed in plan.md and re-listed here before coding. Next action: owner
confirms the plan's Open Decisions; then T010.

## Convergence

After each delivery compare the code with spec.md and plan.md, append demonstrated gaps as new
numbered tasks and preserve completed history. A changed requirement updates spec.md and plan.md
before new work. No unaccepted expansion (impersonation, billing, additional module types, e-mail
delivery) is implemented under this change.
