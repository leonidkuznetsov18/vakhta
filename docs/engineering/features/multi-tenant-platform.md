# Multi-tenant platform engineering memory

## Outcome and scope

2026-09-21; active feature `specs/011-multi-tenant-control-plane`, baseline `0566952`, current
`master` checkout. Owner request: each client plant gets its own database, bot, kiosk and branded
interface, created from a platform control panel that assigns modules. The foundation and initial control panel are implemented. The current continuation starts from
`426cd1f` and closes CI, security and browser acceptance gaps before tenant settings and cutover.

## Current behavior and ownership

Production API and worker use registry mode. Pilot and SuperFactory are active with separate
databases and addresses; control hosting and owner TOTP sign-in are verified. SuperFactory starts
with its panel, with bot setup explicitly deferred by the owner. The first-password page is open
for the owner; password submission is not claimed as verified. Facts and file references: spec RECON. Product document:
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

## Control hosting deployment (2026-09-21)

The owner authorized Cloudflare/Railway setup and Chrome Private browser use. The extension
confirmed the requested profile, Cloudflare browser sign-in worked, and the existing authenticated
Railway CLI and Cloudflare credentials supplied the deployment operations.

- Created Railway `control-api` service `bbb31de2-6508-47ed-a434-0837f7bfbbeb` with its existing
  Dockerfile, registry pre-deploy migration and health check on port 3100. Deployment
  `0c4c58a2-e00c-45ec-ac60-dcde421aa962` at source `26de4b3` reached SUCCESS. GitHub check-suite
  gating is enabled for subsequent pushes. Restart policy is ON_FAILURE, at most ten retries.
- Created `vakhta_control` on the existing PostgreSQL cluster with a dedicated login/owner.
  Applied registry migrations through 0002. The control service uses the private registry URL;
  its provisioning administrator URL is separate and is not copied to API/worker.
- Created Pages project `vakhta-control`, deployed production assets from `26de4b3` as
  `cf9fdb23.vakhta-control.pages.dev`, associated `control.vakhta.xyz` and activated its certificate.
  Set repository variables CONTROL_API_URL and CONTROL_PAGES_ENABLED for future CI uploads.
- Registered `control-api.vakhta.xyz` on Railway, port 3100, with its CNAME and ownership TXT in
  Cloudflare. The API certificate is valid and public HTTPS /health returns the control service.
  GET /auth/get-session returns null with the exact frontend CORS origin and credentials enabled;
  unauthenticated GET /control/tenants returns 401.
- Created the first PLATFORM_ADMIN for the owner-provided email. Its generated password is in
  1Password Private, **Vakhta Control — superadmin**. Registry/encryption/auth secrets are in
  **Vakhta Control — production secrets**, with a successful read-back comparison. No values are
  included in this report. Owner TOTP enrollment and backup-code custody remain pending.
- The control hostname is active on authoritative DNS, Cloudflare and Google public resolvers.
  HTTPS HTML returned 200 with the expected title/assets using an authoritative address and normal
  certificate validation. The local router resolver still returned NXDOMAIN, so Chrome Private
  could not complete live panel acceptance in this check. No TLS checks or browser protections
  were bypassed. Local authenticated screenshots remain separate evidence.
- Independent review found no blocking control-hosting configuration issue. The Railway plan
  initially proposed deleting api.USER_GUIDE_URL; added preserve() for that existing variable and
  the new control host/cookie settings. Applied only the new service's intended changes; did not
  apply unrelated Redis/pilot changes from the full project plan.
- Pilot API/worker remain in env mode; no production employee actions or tenant cutover occurred.
  Control hosting does not complete the welcome flow, runtime configuration or automatic DNS.

## Tenant backups (T040, 2026-09-21)

- `scripts/db/backup.sh` keeps the pilot dump and its key, then lists `vakhta_control` and
  `vakhta_t_*` on the cluster and dumps each to `postgres/<database>/`. One failed tenant dump
  does not stop the others; the job fails at the end. `BACKUP_ALL_DATABASES=false` disables it.
  The nightly workflow passes the PostgreSQL 18 `psql` alongside `pg_dump`.
- `scripts/db/restore.sh` accepts `RESTORE_ROLE`: the administrator restores on behalf of the
  tenant role, so objects stay owned by it (provisioning creates the database owned by the role and
  migrates as the role). Extension entries are skipped because the script creates them first.
- Evidence: `scripts/db/backup.test.mjs` (4 tests with fake tools, part of `pnpm test`) and a local
  PostgreSQL 16 drill recorded in `docs/runbooks/recovery.md`: counts identical after restore, no
  foreign-owned objects, the tenant URL works after the rename swap. Production drill not run.

## Tenant settings (T023, 2026-09-21)

- Catalog: `packages/contracts/src/tenant-settings.ts` (25 section-18 keys, zod ranges, groups,
  defaults, cross-field rule QR lifetime >= rotation). Overrides are rows of the tenant `settings`
  table, scope `global`, key `tenant.<name>`. Out-of-range rows, and a stored QR pair that breaks
  the rule, fall back to defaults and are reported as invalid.
- Defaults: the pilot (reserved env identity) keeps its deployment env values; every other tenant
  uses the catalog. Rollout effect: SuperFactory moves from the shared API env values to the
  catalog defaults; set overrides on its Parameters tab if it needs the production env values.
- API: each `TenantRuntime` holds its settings; `enter`/`prepare` reload them when older than
  `REGISTRY_REFRESH_SECONDS`, deduplicate loads, and keep the last values on failure (also across
  a runtime rebuild). Module options are `lateBound` reads of `currentSettings()`, so no deploy.
- Worker: a tenant worker starts only after its settings load (a failed read fails the start and
  the next sync retries); each sync restarts a worker whose settings changed. An unreadable
  database is never treated as a change.
- control-api: `GET/PUT /control/tenants/:id/settings`, PUT for PLATFORM_ADMIN. The write takes a
  per-database advisory lock, reads, checks the cross-field rule and writes in one transaction;
  the registry audit follows. An audit failure is returned as an error and logged with the change.
- control-web Parameters tab: sparse edits over the latest server values (a refetch never discards
  input), inline zod range and cross-field errors, Save/All-to-defaults disabled when they change
  nothing, per-field Reset, and a "Remove invalid values" action for unusable stored rows.
- Evidence: contracts 5, control-api settings e2e 6 (incl. concurrent writers), API isolation e2e
  "applies each tenant its own settings" (AC-028), worker pool 4; local browser QA at 1440 and
  390 px. Independent review (T026) found worker restart-on-read-failure, the non-atomic
  cross-field check, rebuild-to-defaults, unlogged audit failure, draft loss on refetch and
  uncleanable invalid rows; all fixed before delivery.

## Module switches in the tenant API (T031 part, 2026-09-21)

- `@RequiresModule` (`apps/api/src/infra/module-guard.ts`) answers 403 `MODULE_DISABLED`
  (`TenantErrorCode`) for kiosk and terminal routes without `QR_KIOSK`, and for activation codes,
  Telegram relink and Mini App questionnaires without `WORKER_BOT`. It reads the host-bound
  tenant, so a switch applies within one registry refresh. The env tenant always has both.
- Webhooks of a tenant without `WORKER_BOT` verify the secret and acknowledge with 200, dropping the
  update: a 403 would make Telegram queue retries and replay stale messages when re-enabled.
  The API starts no bot (polling or webhook) for such a tenant.
- The bot welcome names the tenant display name in all three catalogs.
- Evidence: isolation e2e "closes kiosk and bot routes..." (disable, other tenant unaffected,
  re-enable), screens test for the greeting; independent review approved after its questionnaire,
  polling and webhook-retry findings were fixed.

## Remaining work

Next: T031 module/branding surfaces and remaining
workspace actions, branding/operator edits, FSD ownership and table pagination (T027). T026 has
browser, auth/provisioning and settings-write review evidence. The runtime,
welcome page, control hosting and production registry cutover are deployed. T018/T033 retain the
unperformed physical-device/Telegram journeys and owner password acceptance. Automatic provider
adapters and domain/deletion lifecycle remain pending; tenant backup code is recorded above.
No production employee action was manufactured during acceptance.

## Runtime and first-login continuation (2026-09-21)

Owner-created SuperFactory stopped at manual domain registration. DNS alone would have sent its
panel to the pilot build/API, so the continuation implements T030/T032 before routing that host.
The owner chose panel first, with the bot token to be added later in the control workspace.

- Added the shared browser package `@vakhta/tenant-client` for one validated host/cache boundary;
  frontend adapters initialize it before importing API clients. Production never falls back to
  the pilot API. The panel welcome page owns the public invitation UI in pages/welcome; query
  factories and HTTP boundaries are separate from presentation. Kiosk bootstrapping remains vanilla.
- Added trilingual welcome/password setup, bot deep link/QR and kiosk instructions. Public CORS
  excludes operator credentials. Migration 0052 adds a permanent tenant-side consumption marker;
  tenant-row locking serializes consumption/reissue, and retries reconcile registry audit without
  rewriting an already committed password. Independent review found and fixed reload-only recovery;
  the regression asserts usedAt immediately after inspection, before another password request.
- Explicit legacy-env registration preserves the pilot UUID and its historical Redis/storage
  namespace. Added an env→registry→env rehearsal with real PostgreSQL/Redis, existing session,
  kiosk token and a pending Redis value; the other tenant still refuses cross-tenant access.
- Verification: runtime cache/security tests 12; registry 14; control provisioning/onboarding 14
  plus the previously passing MFA suite; welcome component tests 3; tenant isolation/rehearsal 8;
  contracts 17; i18n 13. Scoped typecheck/lint and panel/kiosk/control builds pass; architecture
  checks pass. Chrome Private displayed the real local welcome API on desktop and at 390×844,
  with screenshots visually inspected and mobile document width exactly 390. Password entry
  remains an owner action; automated local tests cover submission and recovery.
- CI rerun 35613268793 completed successfully and released v1.19.1, including the existing
  Telegram announcement and control Pages deployment. The previous photo-test failure did not
  reproduce on the unchanged rerun; no unrelated incident code was changed.
- Production preparation: backed up pilot and registry to restricted ignored local artifacts;
  restored the pilot backup into an isolated PostgreSQL 18 instance (103 employees, 100 sessions,
  3 terminals). Registered pilot with the reserved env identity, original database/bot secrets and
  verified canonical hosts/Pages aliases. Migrated pilot and SuperFactory through 0052. API and
  worker still use env mode at this checkpoint. Provider routing and final cutover are pending.

## Production registry and SuperFactory rollout (2026-09-21)

- Delivery `1a0ca90` plus kiosk environment-value fix `370b1e1` passed all jobs in
  [CI 35618156827](https://github.com/leonidkuznetsov18/vakhta/actions/runs/35618156827), released
  v1.20.0 and published all four Pages projects and three images. The existing Telegram release
  announcement succeeded. The first attempt failed kiosk lint; the corrected run is the evidence.
- Deployed control-api `577737f8-a342-44c0-a94c-7c42a1063c77` from `1a0ca90` before Pages. Its
  live pilot runtime contract passed before publication. API `d8f5fdb4-6281-4c12-bd36-c5c33937ea3b`
  and worker `e1880734-993b-44bd-b925-cb2007a3cb60` redeployed the existing `26de4b3` images with
  registry variables. The API's next pre-deploy command is the tenant migrator; both databases
  had already received 0052. Image publication is not a claim that Railway deployed that image.
- Backed up all 323 outstanding legacy timer jobs, paused the queue with zero active jobs,
  validated their type, added the reserved pilot tenant ID without changing IDs/delays, and
  resumed it. Rechecked and briefly paused for worker cutover, then resumed in verified registry
  mode. Receipts and backups remain in restricted ignored `test-results/control-cutover/`.
- Pilot health returned 200, anonymous session null, protected overview 401, and an unknown host 404. Its existing host-bound webhook was preserved: zero pending updates and no Telegram error.
  Chrome Private loaded the authenticated pilot overview on v1.20.0 without signing in again.
- Associated SuperFactory panel/kiosk domains with their Pages projects and its API domain with
  Railway port 3000. Created CNAMEs and Railway ownership TXT. Provider associations, public DNS,
  certificates and HTTPS 200 were checked before setting registry domains VERIFIED with audit.
  Railway's domain-specific target differs from the generic manual instruction; no DNS step was
  skipped and no global target was changed. Future tenants still require provider setup.
- Retried REGISTER_DOMAINS through the authenticated control UI; one transient JOB_BUSY response
  was safely retried. The job finished DONE at 15:45:01 UTC: six DONE steps and BOT_WEBHOOK SKIPPED
  because no token exists, as requested by the owner. Elapsed time from creation was 63m35s,
  including the manual deployment/DNS pause; this is not a fast-provisioning benchmark.
- Public configuration returns SuperFactory's own API/kiosk origins and ACTIVE status. Its
  protected API returns 401. Chrome Private shows the Ukrainian production welcome form with
  SuperFactory branding and the invitation's administrator email. Password entry/submission is
  handed to the owner. Live control screenshots were inspected on desktop and at 390px with no
  document overflow. Kiosk HTTPS passes with public DNS and normal certificate validation;
  Chrome's local resolver still returned NXDOMAIN, so that browser/device journey is not claimed.

## Tenant branding completion (2026-09-21)

- The Branding feature has its own control-web FSD slice. The existing workspace routes to it;
  the overview card links directly to the editor. Form drafts own their starting version and
  survive background failures. Viewer access is read-only; invalid/unchanged saves are disabled.
- `GET/PUT /control/tenants/:id/branding` uses the operator MFA/role guard and a transactional
  version check with before/after audit. There is no schema migration. PNG/JPEG/WebP uploads are
  capped at 512 KiB and decoded/re-encoded to bounded WebP; SVG/external URLs are not accepted.
- Logo objects use `tenants/<slug>/branding/<sha256>.webp` in the existing private bucket.
  `GET /public/tenant-logo/:id/:version` verifies the stored tenant-owned key and serves the current
  image with `nosniff` and a five-minute cache. Historical/uncommitted content-addressed objects
  remain private for tenant storage retention/deletion; no unrelated media is made public.
- Runtime config publishes the stable logo URL. Panel sign-in, welcome, navigation and titles,
  favicon and kiosk use the tenant identity. Accessible accent shades are separate from semantic
  status colours. Changes apply on page reload after the control source's five-second refresh.
- Independent read-only review found three issues: background failures discarded a draft, a white
  accent hid primary-coloured text, and offline FileReader work paused indefinitely. All three
  were corrected, with editor recovery and contrast regressions. Focused backend tests cover
  role access, two-tenant isolation, version conflicts, upload validation, removal and storage
  recovery. Browser and deployment evidence is recorded below once verified.

- Local checks: branding backend 6, control-web 12, tenant-client 21, i18n 13 and architecture 3
  passed; affected apps built and type-checked, task-owned lint passed. Chrome Private saved
  name/accent through a real local control-api and retained them on the form. Desktop and 390px
  editor screenshots were visually inspected; tabs now wrap so Branding remains visible. QA
  uses a local operator session stub and an in-memory logo adapter; HTTP role denial is covered
  by the backend tests. The actual R2 SDK upload/read/delete round trip passed separately.
- Supplied the existing R2 settings to Railway control-api without triggering an intermediate
  deployment. Browser file upload is blocked until the owner enables file access for the Chrome
  extension. Panel/kiosk screenshot checks also encountered an extension popup blocking browser
  automation; these are not claimed as completed. No production tenant branding was changed.

## Control workspace UI alignment (2026-09-21)

Accepted scope: the owner's eleven-point Control UI request. Reuse the admin panel's Geist font,
sidebar tokens, 256 px navigation, 32 px desktop / 44 px mobile controls and visible interaction
states. Header actions end with an external-panel icon, an 8 px gap and a labeled status dot.
Clients open from their rows; only the three delivered modules appear with larger green checkboxes.
Database and domain details use existing validated registry fields, never invented live metrics.
Remove domain creation from the UI. Bot help follows Telegram's official BotFather instructions.
Jobs are a checklist with explicit completion/skipped/waiting states and links to configuration;
existing retry/skip contracts and recorded results remain unchanged.

Design: preserve the current page composition and backend contracts. Domain-independent controls
stay under shared; the tenant status indicator has an entity public API. Workspace detail models
prepare technical fields and job destinations outside rendering. Query owns remote state; disclosure
state is local. All added copy ships in uk/en/ru. No new infrastructure, migrations, secret exposure
or production tenant mutations are part of this change. Existing broad page-layout debt remains.

Acceptance: focused component/navigation regressions, control-web type/lint/build checks, i18n
parity, and visual inspection of affected desktop/390 px views. Reuse the authenticated production
session for read-only acceptance after CI publication; local fixtures cover unfinished jobs.

- Local verification: 18 control-web tests and 13 i18n tests pass; scoped ESLint and the control
  production build/typecheck pass. New regressions cover row navigation, module mutations, domain
  disclosures, skipped-step destinations, webhook-secret presence and click-open information tips.
- Chrome Private screenshots were captured and visually inspected at 1440×1000 and 390×844 for
  Database, Bot, Domains, Modules, Jobs and Clients. Mobile navigation uses a focus-managed Radix
  drawer; document width stays 390 px. Synthetic local records cover manual and skipped job steps;
  no production configuration was changed. Artifacts: `test-results/control-style/` (ignored).
- Independent review found touch-inaccessible information tooltips; controlled click opening fixes
  this while keeping hover/focus. Visual QA also found TooltipTrigger overwriting the checkbox's
  state attribute; a wrapper preserves checked styling. Both have regression coverage.
- Bot help source: [Telegram BotFather tutorial](https://core.telegram.org/bots/tutorial).
  Deployment and authenticated production acceptance follow the normal master CI publication.

## Tenant administrator management (2026-09-21)

Accepted scope: the owner requests replacing the completed onboarding banner with a clear tenant
administrator list, remote password changes/reset and deletion. Current Overview renders its link
unconditionally; administrators already live in each tenant's Better Auth tables. Passwords are
one-way hashes and cannot be listed. Reset generates a new password in the operator's browser,
then requires an explicit save; it is available for copying in that dialog only.

Design: `features/tenant-administrators` owns Query factories, actions and responsive dialogs. The
Overview composes it and hides onboarding after consumption. Control API uses the existing MFA
operator guard, tenant database secrets, Better Auth hashing and shared password validation.
Viewers may read; only platform administrators may mutate. All strings ship in uk/en/ru.
Deletion revokes all panel grants, credentials, MFA and sessions while retaining the identity and
historical onboarding records. The last enterprise administrator is protected. Mutations serialize
against onboarding/reissue and other control administrator mutations; tenant-local audit and
invitation-consumption markers commit with the access change. Registry audit failure is surfaced;
local durable evidence remains. No existing passwords are returned, logged or persisted in browser
storage. No migrations, new dependencies, invitations by email or production credential changes.

Acceptance evidence required: tenant isolation and operator roles, validation, distinct administrator
listing, password/session invalidation, prior invitation invalidation, concurrent last-admin removal,
partial-failure audit evidence, failed-draft preservation, viewer/read-only and desktop/mobile UI.
Local backend suite passed 34 tests before hardening; the focused seven administrator cases cover
MFA challenge revocation and pagination. Control UI has eight focused regressions; i18n parity has 13.
Control API typecheck, Control UI production build and scoped lint passed. Independent read-only
review identified pending MFA challenges; both password/removal paths now revoke user-bound
verification records, with regression coverage. Local synthetic two-admin screenshots at 1440×1000
and 390×844, including the password dialog, were captured and visually inspected. Mobile document
width equals 390; focus returns to the action after closing. Browser QA did not submit credentials.

Recovery limits: after registry audit failure, tenant-local evidence remains authoritative; registry
reconciliation is not automatic. Refresh can confirm removal but cannot reveal/confirm a password.
The error preserves the password and reports uncertainty. Existing tenant-panel role revocation and
deletion do not share the Control last-admin guard; the concurrency guarantee here covers Control
mutations. Owner follow-up: mobile workspace tabs now use a burger menu with the current section label;
desktop retains tabs. Real Chrome 390px navigation to Database closes the menu and restores focus.
The coordinated onboarding card styling belongs to the parallel Control UI task; its owner handed
the final files back for this combined delivery. Its pending and issued-link states were visually
inspected at 1440×1000 and 390×844; the long URL scrolls inside its field, without page overflow.
Production acceptance and release status remain pending.

Control sidebar parity follow-up (2026-09-21): replaced the bespoke navigation with the main panel's
sidebar/sheet composition and tokens. The footer now uses the same avatar/name/role, sign-out,
language, appearance and release-version order, including the compact desktop rail. Operator
self-profile reads the existing auth image; missing photos use the same deterministic initials.
No profile editing or tenant/operator identity synchronization is introduced. Control appearance
persists separately. Navigation remains in `widgets/control-navigation`; touch gestures belong to
`features/mobile-navigation`, reusing the main panel's tested edge/gesture algorithm and excluding
interactive edge targets. The shadcn provider uses callback-ref cleanup instead of lifecycle hooks.

Evidence: 39 Control UI/API-boundary/gesture tests passed, Control API typecheck and scoped lint
passed, and production UI build passed. Chrome screenshots inspected at 1440×1000 and 390×844;
light/dark, profile disclosure, collapsed navigation, edge-open/left-close touch gestures and keyboard
focus restoration were exercised. Version is supplied by the existing Pages release build.
Read-only review found missing close-focus restoration and a collapsed logo accessible name; both
were fixed and focus restoration is covered. Workspace tests now await initial router settlement,
use bounded 5-second async assertions/15-second test budgets, and run files serially. CI exposed
expensive jsdom visibility scans around Radix portals; scoped dialog queries use the main panel
suite's `defaultHidden` approach, retaining real dialog behavior and focus assertions. A timing
probe identified the preceding tooltip fixture delaying the next router mount (5.3 seconds locally,
versus 21 milliseconds in isolation). That primitive regression now lives in its own test environment.
Expanded/mobile sidebar buttons no longer mount unused tooltip roots, and programmatic dialog
focus uses the main panel's tooltip suppression. No production operator actions were manufactured.

## Operator invitations (2026-09-22)

Accepted owner request: add operators from Control and share a link where each operator chooses
their own password. Baseline `0727fad`; writer/index owner: Codex. Current page is read-only;
bootstrap CLI creates password accounts. Reuse Control auth, MFA, registry verification storage,
Better Auth password hashing, existing dialogs and Query. Manual link sharing follows the existing
Control decision (no mail provider); email delivery remains outside this increment.

Acceptance: only MFA-verified platform administrators create/reissue invitations; names, email and
roles are validated and duplicate email is refused. New operators have no credential until acceptance.
Links expire after the configured invitation TTL, are single-use and are replaced on reissue.
Disabled or already activated accounts cannot use/reissue invitations. Password setting, token
consumption and audit commit together; concurrent acceptance has exactly one winner. Public signup
stays disabled, and normal sign-in/MFA is required after setting the password. All copy is trilingual;
forms preserve failed drafts; desktop/mobile screenshots and focused regression tests are required.

Design: `features/operator-invitations` owns forms, Query mutations and link actions; pages compose
it, with a public `/invite` hash route outside the authenticated shell. Tokens travel in the fragment
and POST bodies, never query strings, logs, audit payloads or persistent browser storage. Registry
stores only SHA-256 token identifiers in a dedicated verification namespace. User-row locking fences
acceptance/reissue/disable; no migration or new auth provider. Ordinary Better Auth reset-email
hooks do not combine admin-only issuance, first-credential creation and control audit in one
transaction, so this bounded service reuses its hashing and storage rather than enabling public reset.
Source checked: https://better-auth.com/docs/reference/options.

Verification: six invitation integration cases pass on real PostgreSQL, covering role/MFA denial,
normalized duplicates, invalid input, expiry, replacement, disabled/activated accounts, token redaction,
concurrent acceptance and audit rollback. The accepted credential signs in through actual Better Auth;
its local issuer is set with the library helper, and Control still refuses access before MFA. Existing
MFA tests pass. Six UI regressions cover create/copy, failed drafts, viewer restrictions, replacement,
public setup, matching passwords, failure/retry and token removal. The complete Control UI suite passed
45 tests, i18n parity 13 and architecture 3. Affected typechecks, scoped lint and production UI build
passed. Independent read-only review found no blocker; the suggested sign-in fallback after a lost
acceptance response is included. Links/passwords are kept only in transient form/mutation memory.

Live read-only recon confirmed the original operator list. Browser QA uses synthetic localhost data;
Chrome blocked further interaction/screenshots because another extension UI was open. Desktop/mobile
visual acceptance is therefore pending, not inferred from component tests. Production account creation
or password changes were not performed. Publication and deployed read-only checks are tracked in the
delivery conversation and CI; no provider configuration or manual release messages are required.

Client search clarity (2026-09-22): the client column now explicitly says Name in all three locales
and always shows a labeled slug below the name; a configured panel hostname stays on its own line.
Search still matches name or slug, with existing whitespace/case normalization. First-cell text wraps
within bounded children. Local synthetic Chrome checks covered name/slug searches, a client without
a hostname, and visually inspected screenshots at 1440x900 and 390x844 (document width 390).
Control typecheck, scoped ESLint and 13 i18n tests passed. This is presentation-only; production and
release verification are separate from the local fixture evidence.

Invitation copy feedback (2026-09-22): successful clipboard writes replace Copy with Check and
use the existing localized copied label for two seconds. A repeated copy restarts the timer;
failed writes keep the error/retry flow and never show success. The feature model owns the timer,
and callback-ref cleanup cancels it on dialog unmount. No new dependency or translation is needed.
Seven invitation UI tests pass, including timed icon reset, repeated copy and clipboard failure/retry;
Control typecheck and scoped ESLint pass. Synthetic localhost screenshots were captured and visually
inspected on desktop and at 390x844, including keyboard activation and retained focus. Real operator
invitations were not created or replaced for QA; release/deployment evidence remains separate.
