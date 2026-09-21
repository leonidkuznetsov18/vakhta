# Multi-tenant platform engineering memory

## Outcome and scope

2026-09-21; active feature `specs/011-multi-tenant-control-plane`, baseline `0566952`, current
`master` checkout. Owner request: each client plant gets its own database, bot, kiosk and branded
interface, created from a platform control panel that assigns modules. The foundation and initial control panel are implemented. The current continuation starts from
`426cd1f` and closes CI, security and browser acceptance gaps before tenant settings and cutover.

## Current behavior and ownership

Production remains the single pilot in env mode. The API and worker support registry mode in
code; the operator control service and panel have been exercised locally. Facts and file references: spec RECON. Product document:
[Multi-tenant platform](../../features/multi-tenant-platform.md) (implementation in progress).

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
- The owner-confirmed defaults and hostname decisions are recorded in plan.md and issue #92.

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
- Provider facts were subsequently checked in research.md; provider automation remains pending.

## Independent review and delivery-2 backend (2026-09-21)

- Review (T017, separate session) found: an unwrapped attachment-cleanup loop, runtime recycling on
  every registry write, one bad tenant blocking API boot, unprefixed API uploads, missing worker
  pool tests and an unimplemented `bootstrap-admin --tenant`. All six were fixed: per-tenant
  fingerprints with a 30 s deferred close for old handles, registry-mode tolerance of a failing
  tenant at boot (env mode stays fail-fast), `currentStoragePrefix()` on API uploads, pool and
  job-resolution tests, `--tenant` in the CLI. Hypotheses addressed: the registry watermark now
  covers secrets, branding, domains and modules; fingerprints use a MAC key derived from the first
  key version; CORS keys on the env tenant id; bots use the tenant time zone; the register CLI
  accepts secrets from the environment.
- Provider facts verified (research.md): managed hostnames became one label under the zone.
- `apps/control-api` (delivery 2 backend): operator better-auth with mandatory TOTP guard,
  tenants CRUD with audit, module switches, domains, bot token with `getMe` validation and
  fingerprint uniqueness, suspend/resume, invitations, provisioning jobs with resumable steps
  (`CREATE_DATABASE`, `MIGRATE`, `SEED_DEFAULTS`, `STORAGE_PREFIX`, `REGISTER_DOMAINS` with a
  manual DNS instruction, `BOT_WEBHOOK`, `INVITE_ADMIN`, `REMOVE_WEBHOOK`, `EVICT_RUNTIME`), the
  public tenant-config endpoint, operators page API and a `bootstrap-operator` CLI. Registry
  migration 0001 adds operators, control auth tables, jobs, steps, invitations and deletions.
  Steps `FINAL_BACKUP`, `DROP_DATABASE`, `DROP_STORAGE` are explicit "not implemented" (delivery 4).
- Provisioning end-to-end test: create → database, migrate, seed → manual DNS pause → skip →
  webhook → invitation → ACTIVE; public config by kiosk host; duplicate slug refused.

## control-web (delivery 2 UI, 2026-09-21)

- `apps/control-web`: React 19 + Vite + TanStack Query and Router (hash history), Tailwind 4 with
  the panel's theme and copied shadcn primitives, trilingual `control` namespace in `packages/i18n`.
  Screens follow the prototype: operator sign-in with TOTP verification and first-time TOTP setup
  (QR from the better-auth URI), tenant list with search and complete count, quick-create wizard
  (slug suggested from the name, module checkboxes, optional bot token, zod validation with inline
  errors), tenant workspace with tabs (overview with the onboarding link and copy/reissue, modules
  with switches, database, bot token, domains, jobs with live steps and retry/skip on waiting steps,
  audit, danger zone with suspend/resume/provision) and the operators page. Forms disable actions
  until a change exists; every async surface has loading, failure with retry and empty states.
- Not done yet: the parameters tab (T023), branding edits, operator role edits and full workspace
  actions/table standards. Local desktop/mobile evidence is recorded below.
- CI builds control-web with the panel/kiosk job; the Pages deploy runs only when the repository
  variable `CONTROL_PAGES_ENABLED` is `true` and the `vakhta-control` project exists.

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
- `apps/control-api`: provisioning e2e (3 tests) on testcontainers; worker pool tests (3).
- `apps/control-web`: typecheck, ESLint clean-code rules and a production build pass; no browser
  screenshots were captured yet (recorded as a blocked check, not as done).
- Not done in that run: pilot cutover and live QA (T018), tenant settings and welcome. The
  control-web implementation existed, but its browser checks were still pending.

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

## Continuation hardening and local acceptance (2026-09-21)

Baseline `426cd1f`; one writer at a time, with independent read-only review. The two previously
pending CI runs completed with failures: `35598897536` could not copy the unused i18n build into
the control-api image; `35600203161` found no control-web tests. Removed that Docker copy and added
five API-boundary tests rather than suppressing the missing-test failure.

- Registry migration `0002` adds a false-by-default MFA assurance flag to each control session.
  Only successful TOTP/backup-code verification sets it. Previously unverified sessions are
  revoked; legacy sessions must sign in again. The guard also checks operator status and role.
- A tenant advisory lock serializes runners and operator recovery; step checkpoints commit
  separately so interrupted RUNNING steps resume. Retry requires a failed/manual step. Skip is
  restricted to manual DNS registration and is audited; it does not verify the domain.
- Automatic database creation uses a tenant-specific role, an ownership marker and database
  ownership checks. It preserves foreign databases/roles, safely quotes identifiers, preserves
  persisted credentials across restart and never writes provider/SQL secrets into job errors.
- Invitation Copy uses the real token, with HMAC recovery for new tokens and verification of
  legacy job outputs. Reissue uses the invitation record and serializes replacement, independent
  of the latest job kind. Viewer responses redact bearer links from tenant and both job reads.
- Control-web now uses a stacked mobile navigation, bounded main/grid widths, scrollable tabs
  and wrapping job headers. The tenant record refreshes during provisioning so completion,
  schema and onboarding changes appear without reloading. Session-fetch failure has retry.
- Focused verification: 11 control-api tests on real PostgreSQL (MFA, viewer boundaries,
  concurrency, interrupted recovery, foreign resources, invitation replacement, error redaction);
  five control-web API tests; affected type/lint/build checks and frozen lockfile verification.
  The control-api Docker image built successfully and its production-mode container returned
  healthy from /health against the isolated registry. Independent review of the final backend
  changes found no remaining blocking defect.
- Local browser evidence: real control-api and isolated PostgreSQL, operator enrollment and
  sign-in, quick creation to manual DNS, all eight implemented tabs, tenant/operator lists and
  API-error retry. After migration 0002, fresh TOTP enrollment passed; manual DNS skip completed
  provisioning, changed the tenant to ACTIVE without a reload and exposed the new invitation.
  Reissue replaced the link; desktop/mobile remained bounded. Desktop 1440x1000 and mobile 390x844 screenshots were captured and visually
  inspected. Eighteen measured list/tab layouts have no page overflow; no browser exceptions.
  Artifacts are local under `test-results/control-qa/`; these are not deployed/physical-device QA.
- Live infrastructure check: Railway production lists api, worker, Postgres and Redis, with no
  control-api service yet. Neither CONTROL_PAGES_ENABLED nor CONTROL_API_URL repository variable
  is set. The service declaration in `.railway/railway.ts` is not evidence of deployed hosting.

## Remaining work

Next: T023 tenant settings and the parameters tab; T030 welcome; T031 module/branding surfaces;
T032 runtime configuration. Complete the unimplemented workspace actions, branding/operator edits,
FSD ownership and table pagination (T027), and deploy control hosting (T028). T026 has browser and
current auth/provisioning review evidence; settings-write review remains dependent on T023.
Then rehearse rollback, complete T018 pilot cutover and T033 first non-pilot live acceptance.
Delivery 4 backups/domain lifecycle/deletion remain pending. No production cutover, provider DNS
mutation or production employee action was performed by this continuation. CI/deployment results
for the new source must be reported separately after the push.
