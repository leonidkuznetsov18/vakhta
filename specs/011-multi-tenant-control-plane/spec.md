# Feature Specification: Multi-tenant platform and control panel

**Change**: 011-multi-tenant-control-plane | **Created**: 2026-09-21 | **Status**: Draft
**Baseline**: 0566952 | **Checkout**: master
**Authority**: Owner request, 2026-09-21: move from one customer deployment to a platform where
every client plant has its own database, bot, kiosk and branded interface, created and managed from
a super-admin panel that assigns modules. Status becomes Accepted when the owner confirms the items
under "Open Decisions" in [plan.md](plan.md).
**Product document**: [Multi-tenant platform](../../docs/features/multi-tenant-platform.md) (planned)
**Engineering memory**: [Multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md)
**Companions**: [research.md](research.md), [data-model.md](data-model.md),
[ADR-0015](../../docs/adr/0015-database-per-tenant-with-control-plane.md)

## RECON: Current Behavior

Facts at baseline `0566952`:

- One deployment serves one customer. Railway project `vakhta` runs `api`, `worker`, one Postgres
  and one Redis (`.railway/railway.ts`). Cloudflare Pages hosts `vakhta-panel`, `vakhta-kiosk` and
  `vakhta-landing`. One employee bot (`@vakhta_worker_bot`) and an optional support bot exist.
- The API opens one Drizzle client from `DATABASE_URL` in `apps/api/src/infra/database.module.ts`
  and exports it as the global `DATABASE` token; 94 files under `apps/api/src` import `@vakhta/db`.
  better-auth is created once against that client (`apps/api/src/auth/auth.config.ts`); users,
  sessions and role grants live in the same database.
- The worker (`apps/worker/src/main.ts`) opens one database, one Redis and one bot token. Outbox
  relay, communication dispatch, timers, media processing, photo inspection and retention assume it.
- The Telegram bot is one grammY instance created from `TELEGRAM_BOT_TOKEN`
  (`apps/api/src/telegram/telegram.service.ts`) with the webhook path `/telegram/webhook`.
- Panel and kiosk are static builds with `VITE_API_URL` baked in at build time and a canonical
  origin redirect (`apps/admin-web/src/canonical.ts`, `apps/qr-kiosk/src/main.ts`). The kiosk pairs
  with a one-time code and keeps its device token in browser storage.
- Migrations run per deploy through `packages/db/src/migrate.ts` against one `DATABASE_URL`
  (Railway `preDeployCommand`). The nightly backup (`.github/workflows/db-backup.yml`) dumps one
  database from one secret URL.
- Inside a customer the model is already hierarchical: `sites` (time zone) → `org_units` → `teams`
  and `responsibility_zones`. Panel roles carry a scope `ENTERPRISE | SITE | ORG_UNIT | TEAM | ZONE`
  (`packages/domain/src/access/roles.ts`, ADR-0009). `ENTERPRISE` means "the whole customer".
  `settings` is keyed by `global` or a site id.
- Branding is the platform name `admin.productName` (`Vakhta`) in eight panel files, `APP_NAME` in
  better-auth and the bot username from env.
- Local development, CI and tests use `.env`, `pnpm db:seed` and testcontainers with one database.

Hypotheses, to be confirmed by plan research tasks: Railway and Cloudflare can serve the tenant
hostname scheme without manual work per tenant; one Postgres service holds one database per tenant
within its connection budget; an `AsyncLocalStorage` proxy keeps the 94 injection sites unchanged.

Reuse: sites/units/zones for intra-tenant structure; `settings`; audit log and event store patterns;
`background_tasks` and outbox durability (ADR-0008); kiosk pairing; activation codes;
`apps/api/src/cli/bootstrap-admin.ts`; better-auth with TOTP; the provider inventory in
`docs/runbooks/platform-operations.md`. Option analysis: [research.md](research.md).

## SPEC: Outcome and Boundaries

**Outcome.** Vakhta becomes a platform. A **tenant** is one client company (a plant or a group of
plants). A platform **operator** (Vakhta staff) creates a tenant in the **control panel**
("Vakhta Control"), assigns **modules**, and the platform provisions an isolated database,
hostnames, a storage prefix and, once the operator pastes a bot token, the tenant's own Telegram
bot. Tenants never see each other. The current customer becomes the first tenant with no data
migration and no visible change.

**Isolation model (decided).** Database per tenant on a shared PostgreSQL cluster; shared stateless
API and worker processes that bind every unit of work to exactly one tenant; one Telegram bot per
tenant; tenant hostnames for panel, kiosk and API; tenant-prefixed object-storage keys and Redis
keys. A tenant can later point at a dedicated cluster or dedicated compute by registry data alone;
this program designs for it but does not automate it.

**Modules.** `ADMIN_PANEL`, `WORKER_BOT`, `QR_KIOSK` are delivered. `SUPPORT_BOT` and
`PHOTO_INSPECTION` are reserved codes for later programs; enabling them has no effect yet. A module
is a switch in the registry: the tenant API refuses the module's routes when it is disabled, the
panel hides its sections, the kiosk shows a localized "not enabled" notice, and a disabled bot has
its webhook removed. `ADMIN_PANEL` is required for a usable tenant in this program; the switch
exists for parity with the owner's model and the control panel warns when it is off.

**Program scope**: four ordered deliveries. Each is a bounded change verified on its own and refines
its exact files in [tasks.md](tasks.md) before coding; completing delivery 1 does not complete the
program.

1. **Foundation**: registry package and control database, tenant context in API and worker,
   per-tenant migrations, `TENANCY_MODE=env` compatibility, pilot registered. No visible change.
2. **Control panel**: operator authentication, tenant CRUD, modules, domains, secrets, provisioning
   jobs with per-step status, control audit log, public tenant-config endpoint.
3. **Tenant surfaces**: per-tenant Telegram bots, module gating, tenant branding and runtime config
   in panel and kiosk, first-administrator invitation.
4. **Operations**: suspend/resume, bot token rotation, multi-tenant backups and a restore drill,
   client-owned domains, provider automation for hostnames, tenant health in the control panel.

**Non-goals.** Row-level multi-tenancy (`tenant_id` columns in the tenant schema); cross-tenant
reports; operator impersonation of tenant users; billing, metering, plans or self-service sign-up;
automatic Telegram bot creation (Telegram has no API for it; the operator uses BotFather); tenant
archive with data deletion (a state only; deletion needs its own approved change); moving the
landing page; product modules beyond the three; anything in AGENTS.md "Out of MVP scope".

**Compatibility.** The tenant database schema is unchanged. Every existing panel, bot and kiosk
journey keeps its behavior for the pilot tenant. `TENANCY_MODE=env` keeps local development, CI and
current production runnable from the existing environment variables until the registry cutover.
Contracts add fields and never remove them.

**Assumptions.** The platform domain stays `vakhta.xyz`; managed tenant hostnames are
`<slug>.vakhta.xyz` (panel), `kiosk.<slug>.vakhta.xyz` and `api.<slug>.vakhta.xyz`; the pilot keeps
`panel.vakhta.xyz`, `kiosk.vakhta.xyz` and `api.vakhta.xyz` as registered domain rows. One Railway
Postgres service hosts all tenant databases in v1. Tenant secrets are encrypted at rest with a
platform key. Operators are few, trusted and always use TOTP. Control panel texts follow the
trilingual rule like every other UI.

## User Scenarios and Testing

### US1: Operator creates a client and provisions its modules (Priority: P1)

Actor: platform operator. Value: a new plant is live in hours, without a deploy or manual database work.

- **AC-001**: Given an operator signed in with TOTP, when they create tenant "ЗаводА" with slug
  `zavoda`, display name, default locale, time zone and modules `ADMIN_PANEL` + `WORKER_BOT` +
  `QR_KIOSK`, then the registry stores a `DRAFT` tenant, its module rows and an audit entry. The
  slug is lowercase `[a-z0-9-]`, 3–32 characters, unique, not reserved, and immutable afterwards.
- **AC-002**: Given a `DRAFT` tenant, when the operator starts provisioning, then a durable job runs
  the steps create database → migrate → seed defaults → storage prefix → register hostnames →
  bot webhook (if `WORKER_BOT` and a token exist) → invite first admin (if `ADMIN_PANEL`). Each step
  records status, attempts and last error; a failed step is retried without repeating completed
  steps; a process restart resumes the job; success sets the tenant `ACTIVE`.
- **AC-003**: Given a provisioned tenant, when the invited administrator opens the single-use,
  expiring invitation link on the tenant panel host, then they set a password, hold `ADMIN` with
  `ENTERPRISE` scope in the tenant database, and see the tenant display name after sign-in.
- **AC-004**: When the operator pastes a Telegram token, then the platform validates it with
  `getMe`, stores it encrypted, shows the bot username, and refuses a token already used by another
  tenant. The token never appears in logs, audit entries or API responses.

### US2: Every unit of work is bound to exactly one tenant (Priority: P1)

- **AC-005**: Given a request whose host is unknown or not verified, then the API answers 404
  `TENANT_NOT_FOUND` before opening any tenant database. A `SUSPENDED` tenant answers 403
  `TENANT_SUSPENDED`. `/health` and `/metrics` are tenant-independent.
- **AC-006**: Given a valid session cookie of tenant A, when it is presented on tenant B's hosts,
  then the request is unauthenticated. Cookies are scoped per tenant host and never shared.
- **AC-007**: Given a kiosk device token issued by tenant A, when it is used on tenant B's API host,
  then it is rejected; QR challenges resolve only inside the tenant that issued them.
- **AC-008**: Given a Telegram update posted to `/telegram/webhook/<tenantId>`, then it is accepted
  only with that tenant's webhook secret and handled against that tenant's database; update
  deduplication is per tenant.
- **AC-009**: Given code that reaches the database, Redis, storage or a bot outside a tenant
  context (no request and no explicit `runWithTenant`), then it fails closed with
  `TENANT_CONTEXT_MISSING`. In registry mode there is no default tenant.
- **AC-010**: Given CORS, then only the tenant's own verified panel and kiosk origins are allowed
  on that tenant's API host.

### US3: The existing customer keeps working unchanged (Priority: P1)

- **AC-011**: Given the current production database, bot and hostnames registered as the first
  tenant, when `TENANCY_MODE` switches from `env` to `registry`, then sign-in, QR arrival and
  departure, the shift flow, incidents, handover, requests, bonus, reports, schedule and the bot
  home screen behave as before. No data is copied or transformed.
- **AC-012**: Given `TENANCY_MODE=env`, then API and worker build one tenant from the existing
  variables and every current test suite passes without a control database.
- **AC-013**: Switching back to `env` restores the previous behavior without data changes.

### US4: Background work runs per tenant (Priority: P1)

- **AC-014**: Outbox relay, communication dispatch, shift, incident and handover timers, media
  processing, photo inspection and retention run for every `ACTIVE` tenant with that tenant's
  database, bot token and storage prefix. A failure in one tenant never stops the others.
- **AC-015**: Every queued job carries `tenantId`. A job without one, or with an unknown or
  suspended tenant, is rejected and logged; timer recovery re-admits work from each tenant database.
- **AC-016**: New media keys are prefixed `tenants/<slug>/`; existing pilot keys stay readable.

### US5: Modules and branding are visible on tenant surfaces (Priority: P2)

- **AC-017**: Given `QR_KIOSK` disabled, then kiosk routes answer 403 `MODULE_DISABLED`, the tenant
  panel hides "Терминалы", and the kiosk page shows a localized notice. Enabling restores all three
  without a deploy.
- **AC-018**: Given `WORKER_BOT` disabled, then the webhook is removed and the panel hides
  bot-only actions (activation codes, Telegram relink) with an explanatory tooltip. Enabling
  re-registers the webhook.
- **AC-019**: `MeView` and the public tenant config expose slug, display name, logo, accent colour
  and enabled modules. Panel title and header, kiosk title and the bot greeting use the tenant
  display name. Every new text exists in `uk`, `en` and `ru`.
- **AC-020**: Panel and kiosk resolve their API base and branding at runtime from the public
  tenant-config endpoint by their own host, validate it with a zod contract, and cache the last
  good answer in browser storage so a kiosk restarts while the control plane is unreachable.

### US6: Operations across tenants (Priority: P2)

- **AC-021**: Migrations run for the control database and then every tenant database under an
  advisory lock. A failure stops the deploy and names the failing tenant. The control panel shows
  each tenant's schema version.
- **AC-022**: The nightly backup stores the control database and every tenant database as separate
  objects. The restore runbook is exercised for one tenant into a scratch database.
- **AC-023**: Suspend blocks tenant traffic and background work within one registry refresh
  interval; resume restores them. Both require a reason and are audited.
- **AC-024**: Bot token rotation validates the new token, updates the webhook and evicts the old
  runtime; the tenant's employees see no gap longer than one refresh interval.
- **AC-025**: Every operator action (create, provision, module toggle, domain change, secret
  change, suspend, resume) is in the append-only control audit log with actor, time and redacted
  before/after values.

### Edge Cases

- Slug collision or reserved label is rejected inline; renaming the display name never changes the
  slug or hostnames.
- Provisioning interrupted mid-way resumes idempotently: an existing empty database is reused, a
  non-empty database that the registry does not own is never touched.
- Registry unreachable at API start: registry mode refuses tenant traffic and reports degraded
  health instead of serving a default; a snapshot loaded earlier in the same process lifetime keeps
  serving until refresh succeeds.
- Two tenants with the same Telegram token: refused at validation by fingerprint.
- Worker crash between tenants: the loop restarts from the registry, never from memory.
- Client-owned domain without DNS or TLS: shown as `PENDING`; the API serves only `VERIFIED` hosts.
- Dev polling mode with several tenants: one poller per tenant with a token; a missing token
  disables the bot for that tenant only.
- Metrics and logs carry the tenant slug; label cardinality is bounded by the number of tenants.
- A tenant with `ADMIN_PANEL` disabled cannot be administered; the control panel warns before
  disabling it.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST keep a control registry with tenants, modules, domains, encrypted
  secrets, branding, operators, provisioning jobs and steps, and an append-only control audit log
  ([data-model.md](data-model.md)); verified by AC-001–004 and AC-025.
- **FR-002**: Every API request and every worker unit of work MUST run inside an explicit tenant
  context that supplies database, auth, Redis prefix, storage prefix and bot; access without a
  context MUST fail closed; verified by AC-005–010 and AC-014–016.
- **FR-003**: `TENANCY_MODE=env|registry` MUST select the tenant source while both modes share one
  context implementation; verified by AC-011–013.
- **FR-004**: Provisioning MUST be a durable, idempotent, resumable job with per-step status and
  manual-action steps when a provider credential is absent; verified by AC-002 and the edge cases.
- **FR-005**: Module switches and branding MUST be enforced by the API and reflected by panel,
  kiosk and bot without a deploy; verified by AC-017–020.
- **FR-006**: Migrations, backups, suspend/resume and bot rotation MUST operate across all tenants
  from one pipeline; verified by AC-021–024.
- **FR-007**: Every new user-facing string, including the control panel, MUST live in
  `packages/i18n` in all three catalogs; verified by the i18n parity test.

### Key Entities

Tenant, TenantModule, TenantDomain, TenantSecret, TenantBranding, Operator, ProvisioningJob and
ProvisioningStep, ControlAuditEntry: [data-model.md](data-model.md). Inside a tenant, Site, Unit,
Team, Zone and Position keep their meaning from `docs/product-vision.md`; `ENTERPRISE` scope now
means "the whole tenant".

## Success Criteria

- **SC-001**: A new tenant with three modules is created and used (panel sign-in, bot activation,
  kiosk pairing) with no code change, no deploy and no manual database work; the operator supplies
  only the BotFather token and, where automation is absent, the DNS records the job asks for.
- **SC-002**: The pilot passes its existing regression suites and the affected live journeys after
  cutover, with the evidence recorded in the engineering memory.
- **SC-003**: Isolation invariants (AC-005–010, AC-014–015) are covered by automated tests running
  against two real tenant databases.
- **SC-004**: Provisioning time per tenant is measured and recorded against the product-vision KPI
  "deployment time at a new site: days, not months"; no numeric target is invented here.

## Verification Scope

Classification under `docs/engineering/testing-baseline.md`: access boundaries, transactions,
migrations and failure recovery. Required: invariant tests on real PostgreSQL with two tenant
databases, failure and retry cases for provisioning and background loops, one independent review of
each delivery's changed boundary, and verification of the deployed pilot after cutover. Changed
product surfaces: control panel (new; desktop and mobile screenshots), tenant panel header,
navigation and branding, kiosk config and notice screens, bot greeting. Delivery 1 changes no
visible surface and needs regression suites plus the pilot cutover check only. Actual results are
recorded once in the linked engineering memory; [plan.md](plan.md) lists the exact checks.
