# Platform operations and access

Owner decision, 2026-09-10: work only in the current Vakhta repository on `master`; push verified
changes directly, without PRs or additional worktrees. Preserve other sessions' edits and serialize
writes and index operations. This runbook records checked access, actual ownership and diagnostic
entry points. A logged-in CLI is not proof that every provider permission or every historical log exists.

## Access and service map

Checked on 2026-09-10 around 10:10–10:18 UTC. Recheck identities and target environment before changes.
Credentials remain in existing CLI sessions / 1Password. No resolved secrets belong in this document.

| Platform   | Verified access and owned resources                                                                                                   | Boundaries                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub     | Authenticated `gh`; `leonidkuznetsov18/vakhta`, default branch `master`; Actions jobs/logs/releases readable                          | Use normal direct pushes after checks; do not introduce a PR requirement. Settings and secret values are separate capabilities.                                                     |
| Cloudflare | Authenticated Wrangler OAuth; Pages `vakhta-panel` and `vakhta-kiosk`; R2 bucket listing includes `vakhta-media` and `vakhta-backups` | Pages projects report no Git provider. CLI authentication is separate from GitHub Actions credentials. R2 listing does not test reading/writing private media or restoring backups. |
| Railway    | Authenticated CLI linked to project `vakhta`, production environment; api, worker, Postgres and Redis status/logs readable            | Use explicit service/environment when reading logs. Do not dump `railway variables` or run migrations as a diagnostic probe.                                                        |
| Namecheap  | Authenticated browser for account `leonidkuznetsov`; `vakhta.xyz` active through Sep 6, 2027, auto-renew checked                      | Profile → Tools shows API Access OFF / Not available. Browser administration works; API integration is not enabled.                                                                 |
| 1Password  | CLI metadata access and matching Namecheap/Cloudflare/Vakhta entries verified                                                         | Prefer autofill or `op run`; never print secret fields or put them in shell arguments, Git, screenshots or logs.                                                                    |

Namecheap delegates `vakhta.xyz` to `isaac.ns.cloudflare.com` and `julissa.ns.cloudflare.com`; both
its dashboard and public NS resolution agree. Change authoritative DNS records in Cloudflare. Domain
registration/renewal and nameserver delegation belong to Namecheap. Do not switch to Namecheap DNS to
make its record editor available. Private Email management is a separate provider surface; a visible
mail tab or domain account does not prove mail delivery or mailbox/API log access.

Namecheap documents eligibility for production API access and an IPv4 allowlist. Its current UI is the
verified blocker; this task did not purchase services, top up funds or contact support to change it.
Use authenticated browser administration meanwhile. Recheck eligibility before a dedicated API setup.
[Official Namecheap API eligibility](https://www.namecheap.com/support/knowledgebase/article.aspx/9739/63/api-faq/).

## Deployment provenance snapshot

This snapshot precedes the next direct push; it is not a permanent assertion about the deployed version.

| Surface    | Observed deployment / source                                                         | Meaning                                                                                             |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Panel      | Pages deployment `1eb4701a-9223-433e-9ed2-7c5161a8a3ba`, source `5b50cd4`            | Direct Upload project, production branch master; no connected Git provider                          |
| Kiosk      | Pages deployment `2f91abb3-14ea-469e-a837-04c817ffc23c`, source `ca779fa`            | Separate publication history from panel; compare affected files before calling the difference stale |
| API        | Railway deployment `22240ce7-ff6b-4229-97eb-137f44893d4d`, source `324d29e`, SUCCESS | Public domain `api.vakhta.xyz`, port 3000, Dockerfile build                                         |
| Worker     | Railway deployment `394efbdd-696f-463a-bdb1-6d2a5c411470`, source `324d29e`, SUCCESS | Standalone worker, separate deployment from API                                                     |
| PostgreSQL | Railway image `ghcr.io/railwayapp-templates/postgres-ssl:18`, deployment SUCCESS     | Provider configuration evidence; local/test PostgreSQL is 16                                        |
| Redis      | Railway image `redis:8.2`, deployment SUCCESS                                        | Provider configuration evidence; local/test Redis uses 7-alpine                                     |

API/worker watch patterns include their respective app, packages and pnpm workspace/lock files. An
unrelated frontend-only commit need not redeploy backend code. `/health` returned status ok during this
inspection; its source returns process liveness and server time, not database/Redis readiness.

## GitHub release and Telegram changelog

Source: `.github/workflows/ci.yml` and `scripts/release/announce-telegram.mjs`.

```text
push master -> check -> semantic-release
                       |-> new version -> announce -> existing Telegram changelog bot -> Vakhta Dev
                       |-> images
                       |-> production Pages build -> required upload
```

The owner identifies the destination as the private group **"Вахта Dev"**, with messages from
**"Вахта Changelog Bot"**. This is distinct from the employee-facing `@vakhta_worker_bot`.
The script uses `TELEGRAM_RELEASE_BOT_TOKEN` and `TELEGRAM_RELEASE_CHAT_ID` from GitHub secrets; do not
copy their values into documentation or add a second bot/destination.

Run `34462629265` published `v0.70.1`; its announcement log explicitly says the announcement was sent.
The owner's screenshot shows the matching release message. The `announce` job depends on `release`,
not `images`/`pages`; a message can arrive before all deployment jobs finish. The send step has
`continue-on-error: true`, so inspect that step/log rather than treating overall release success as
proof of delivery. A docs/chore-only push may legitimately publish no version and send no message.

That same run explicitly logged missing `CLOUDFLARE_API_TOKEN` and skipped panel/kiosk uploads. Local
Wrangler authentication does not fix that GitHub secret. Actual Pages projects have no Git provider;
the observed deployment path is Direct Upload. Before automating uploads, choose the delivery owner
and configure a dedicated appropriately scoped CI token; never copy a desktop OAuth session into CI.
No token, deployment destination or notification behavior was changed in this access/documentation pass.
[Inspected CI run](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34462629265).

### Dedicated Pages CI credential and workspace correction

On 2026-09-10 the owner approved creation and storage of the account-owned token
`vakhta-github-pages`, expiring 2027-09-11. Its only permission is **Pages Write**, covering Pages
projects in account `8d31b0a5b6972c2ff30a7f33e299fee1`; it grants no DNS or R2 access. The credential
is stored in 1Password Private as **Vakhta GitHub Pages — Cloudflare** (item
`bz3zlrbzfnmy5of43jiyjbcpxm`, concealed `credential` field) and the repository Actions secret
`CLOUDFLARE_API_TOKEN`. A credential-backed Pages project listing returned HTTP 200 and both expected
project names. This verifies authentication/read access, not publication.

The Pages-only retry of run `34471342564` then exposed a previously hidden deployment failure:
`cloudflare/wrangler-action@v3` tried `pnpm add wrangler@3.90.0` at the workspace root and failed with
`ERR_PNPM_ADDING_TO_ROOT` before upload. Both deployment steps now run the explicitly pinned
`pnpm dlx wrangler@4.129.0`, preserving the production paths, project names, branch and source SHA.
The local command resolved and printed version 4.129.0 without changing workspace dependencies.
Missing token/account configuration now fails the job; a green result must not conceal skipped uploads.

Application baseline `7195396` passed build/lint/tests in that run and published `v0.70.4`; the existing
Telegram announcement step succeeded. The workflow-only correction reuses that application evidence;
its publication outcome must be checked in the next CI run before claiming the panel/kiosk are current.
Rotate the dedicated token through 1Password and the existing GitHub secret before expiry. Do not
replace it with a desktop OAuth session or widen permissions to repair an unrelated deployment error.

Sources: [Cloudflare direct upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[account-owned tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/),
[Wrangler 4.129.0 release](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.129.0).

The correction shipped as `a5ee2e5`. Run `34472618740` passed both actual upload steps, and Pages
deployment history confirms that source for panel `5482faa3-ec23-460c-a5a6-9653d35bb415` and kiosk
`68a37467-a0cf-44e9-a93b-2d1c02db3117`. The authenticated panel displayed v0.70.5 and loaded the
updated loss report with its cutoff and matching export URLs. At 390x844, filters, export controls
and the wrapped cutoff text remained readable. No application console errors were captured;
unrelated wallet-extension errors were excluded. The paired kiosk still selected `Основний`.

The owner's existing `.env.production` user API token was separately verified active; Pages access
returned HTTP 403. Its Access Custom Pages permission is for Cloudflare Access block pages, not
Pages hosting. With explicit owner authorization it is saved in Private as **Vakhta Cloudflare API —
user token**, item `btchjtxgsfbcl74ok5y2lzu5em`, concealed `credential` field; a read-back comparison
matched the source without exposing either value. The owner chose to retain this token and the
dedicated CI token, removing only vault duplicates. The inventory contained no duplicate Cloudflare
items: the two credentials and the separate **Cloudflare** login were retained. No provider token
was revoked. The Origin CA deprecation notice refers to a different certificate-service key and
does not invalidate these API tokens.
[Cloudflare Origin CA key deprecation](https://developers.cloudflare.com/fundamentals/api/get-started/ca-keys/).

## Diagnostic entry points

Run commands from the current repository. Read results privately and publish only a redacted summary;
logs may contain employee details, request parameters or third-party errors. Keep queries bounded.

```sh
# Repository, releases and a selected CI run
 gh repo view --json nameWithOwner,defaultBranchRef,url
 gh run list --limit 10 --json databaseId,headSha,status,conclusion,displayTitle
 gh run view <run-id> --json jobs
 gh run view <run-id> --log-failed
 gh release list --limit 5

# Cloudflare project/deployment history and storage inventory
 wrangler whoami
 wrangler pages project list
 wrangler pages deployment list --project-name vakhta-panel --environment production --json
 wrangler pages deployment list --project-name vakhta-kiosk --environment production --json
 wrangler r2 bucket list

# Railway: specify the intended linked production environment and service
 railway status --json
 railway logs --service api --environment production --lines 100 --json
 railway logs --service worker --environment production --lines 100 --json
 railway logs --service api --environment production --latest --build --lines 100
 railway logs --service api --environment production --http --status '>=500' --lines 50
 railway logs --service Postgres --environment production --lines 50 --json
 railway logs --service Redis --environment production --lines 50 --json

# Public liveness and delegation, without credentials
 curl -fsS --max-time 15 https://api.vakhta.xyz/health
 dig +short NS vakhta.xyz
```

In the bounded deployment-log sample, API returned seven records, worker four, Postgres 60 and Redis 60. Log reads succeeded; this small sample is not an all-time error audit. An additional API HTTP query
for status >=500 over the preceding hour, capped at 30 records, succeeded and returned zero records.
This is a bounded provider query, not proof that no client or application errors occurred. Build-log
mode is supported by installed `railway logs --help` but was not exercised in this pass. For an
incident, bind the time window, deployment and request ID before examining more data.

Pages Function tails are for deployed Functions; they do not replace browser JavaScript errors or
historical static-asset request analytics. No Pages Functions runtime was identified in these Vite
apps. Use browser console/network evidence for frontend issues, deployment history for publication
issues and Cloudflare DNS/security dashboards for edge failures. Do not claim every static request is
retained as a downloadable log. [Cloudflare logging scope](https://developers.cloudflare.com/pages/functions/debugging-and-logging/).

## From an error to a verified correction

1. Identify the user journey and affected deployed revision: panel, kiosk, employee bot, API or worker.
2. Correlate bounded logs, browser evidence and relevant source/contracts. Keep private data out of the handoff.
3. Reproduce the failure at the cheapest meaningful layer; record expected behavior before editing.
4. Implement the authorized small change in this checkout, update feature memory, review the fixed diff,
   and run `pnpm build` / `pnpm check` plus relevant regression and mobile/bot checks.
5. Commit exact owned paths in English, push normally to master, inspect CI/release/announcement outcomes,
   then verify the affected deployment and user journey. A green build and a Telegram message alone do
   not prove the frontend was uploaded or the API/worker revision changed.

The [product QA runbook](product-qa.md) defines dev identity, terminal and credential handling. The
[architecture audit](../audits/2026-09-10/architecture-audit.md) maps source boundaries; its historical
PR/worktree proposals are superseded by the owner's direct-master decision.

## Durable-task foundation deployment, 2026-09-10

Source `f9a437c` passed CI `34479700951`, publishing v0.70.9. Railway API
`670ddf9c-ccb3-4ab0-8fb0-dc49650db362` and worker `e7c513f2-c0d7-446c-9310-35e11be8aa68`
reported SUCCESS at that source. Before consumer deployment, a read-only PostgreSQL check confirmed
`background_tasks`, all validated constraints and enabled `background_tasks_intent_immutable` trigger;
the table contained zero tasks. API health returned ok at 13:11:19 UTC. A capped ten-record API
error-level query since 13:10 UTC returned zero records. Authenticated panel v0.70.9 loaded the
handover list and live updates. These observations do not establish absence of all runtime failures.

GitHub showed one matching PushEvent but two workflow runs. Duplicate `34479701736` was canceled
before release/Pages to prevent the source-version fallback regression described in
[release delivery](../engineering/features/release-delivery.md). Railway continued automatically
with Wait for CI enabled; duplicate deployments were subsequently removed. No gate setting or
production business record was changed as a workaround. The dispatch duplication cause is unproven.

## Durable media and CI resolver deployment, 2026-09-10

Consumer `e17b431` passed CI `34482489884`, release v0.70.10, API
`d25dcba8-9344-40e7-9a9e-b05e636ba3e7` and worker `d75f8487-0c66-49e8-b464-e517eecb2888`.
Startup recovered 39 bonus intents; they remain pending until the bonus consumer exists. One organic
durable media task subsequently completed in one attempt with matching storage projection and event.
Authenticated panel desktop/mobile gallery, fresh Telegram help and paired Main kiosk were checked.
Exact counts, times and bounded log checks are in the media processing engineering memory.

Resolver `1681a76` passed CI `34483329441` at `3824f13`: no new release, Pages version 0.70.10,
announcement skipped, API/worker images unchanged. It does not alter the Railway CI gate. See the
release delivery engineering memory for the distinction between deployed fallback and synthetic rerun
regression coverage. Timer rollout and broader bonus recovery remain separate verification gates.

### Local release tags missing from the Git history — 2026-09-12

GitHub releases `v0.93.3` through `v0.93.8` had matching remote Git tags, but this checkout only knew
local tags through `v0.93.2`. Release commits alone do not prove that the local tag refs are current.
Compare `git ls-remote --tags origin` with `git tag` before changing release automation or creating tags.

The checkout now uses `git config --local remote.origin.tagOpt --tags`; `git fetch origin --tags`
restores the missing local refs and future ordinary origin fetches include all tags. Explicit
`--no-tags` from a GUI overrides this default. Never force-update or recreate existing release tags.

Run `34692945641` stopped before release because the shared help test still asserted obsolete Schedule
copy. The test now verifies the current catalog's steps and questions while preserving its collapse,
expand and FAQ interaction assertions. The release pipeline correctly withheld publication after the
failed check; semantic-release tag creation and the existing Telegram announcement path are unchanged.

## Multi-tenant foundation, 2026-09-21

### Control hosting and operator access

The operator panel is `https://control.vakhta.xyz`; its separate API is
`https://control-api.vakhta.xyz`. The frontend is the Cloudflare Pages Direct Upload project
`vakhta-control`. Repository variables `CONTROL_API_URL=https://control-api.vakhta.xyz` and
`CONTROL_PAGES_ENABLED=true` enable its existing CI deployment step.

Railway production service `control-api` builds `apps/control-api/Dockerfile` from `master`,
waits for GitHub checks on subsequent pushes, runs
`node packages/registry/dist/cli/migrate.js` before deployment and checks `/health` on port 3100.
Its registry database is `vakhta_control`, owned by the dedicated `vakhta_control_owner` role.
It uses the existing PostgreSQL cluster; creating another PostgreSQL service is unnecessary.

Required configuration:

| Variable                                   | Production value or purpose                                               |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `production`                                                              |
| `CONTROL_HOST`, `CONTROL_PORT`, `PORT`     | `0.0.0.0`, `3100`, `3100`                                                 |
| `CONTROL_DATABASE_URL`                     | Private network URL for `vakhta_control_owner` and `vakhta_control`       |
| `CONTROL_ENCRYPTION_KEY`                   | 32 random bytes encoded as hex; preserve it to decrypt tenant secrets     |
| `CONTROL_AUTH_SECRET`                      | Separate control authentication secret; never reuse the tenant API secret |
| `CONTROL_PUBLIC_BASE_URL`                  | `https://control-api.vakhta.xyz` (the auth API origin)                    |
| `CONTROL_CORS_ORIGINS`                     | `https://control.vakhta.xyz`                                              |
| `AUTH_COOKIE_SAME_SITE`, `PLATFORM_SCHEME` | `lax`, `https`                                                            |
| `PROVISION_DATABASE_ADMIN_URL`             | Cluster administrator URL; only the control service receives it           |

The encryption key, auth secret and registry password are stored in 1Password Private as
**Vakhta Control — production secrets**. The first operator's login is stored as
**Vakhta Control — superadmin**. Retrieve credentials through 1Password; never paste them into
Git, reports or shell arguments. First sign-in requires the owner to enroll TOTP and save the
backup codes. A password-only session cannot access control routes.

DNS records belong to Cloudflare. `control.vakhta.xyz` must be associated with the Pages project
as a custom domain as well as having its CNAME. `control-api.vakhta.xyz` is a Railway custom domain
targeting port 3100, with its provider-supplied CNAME and ownership TXT record. Verify certificates
normally; do not bypass certificate errors while issuance is pending.

For a control-hosting rollback, roll back only the affected Pages/Railway deployment. Preserve
the registry and its encryption key. Control hosting does not switch the pilot to registry mode.
Before applying `.railway/railway.ts`, inspect the plan: creating the control service does not
authorize incidental Redis or pilot API configuration changes.

Tenant creation runs from the control panel and records provisioning progress. Host registration
is still manual: associate each hostname with its Railway/Pages service, create the requested
DNS records and retry the domain step. Railway can assign a domain-specific CNAME different from
the generic instruction; use the provider's actual target and ownership TXT. A strict CNAME check
cannot verify proxied records or that different target. In those cases, verify the provider
association, public DNS and HTTPS certificate, then record an audited domain-verification
checkpoint before retrying. Skipping the step does not verify a hostname. Cloudflare provides a
[domain validation retry](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/edit/)
after the records are created. Do not change the global API CNAME target for one tenant.

Welcome and runtime configuration are deployed in v1.20.0; the pilot uses registry mode and
SuperFactory is ACTIVE. The operator copies the invitation from the tenant overview; the recipient
sets a password on that tenant's panel. A missing bot token does not block panel-first onboarding.
Device/Telegram acceptance and the owner's first-password action are tracked separately in
`specs/011-multi-tenant-control-plane/tasks.md`; an ACTIVE record alone does not prove sign-in.

### Tenant runtime and pilot cutover

Source: `specs/011-multi-tenant-control-plane` (delivery 1). The API and worker bind every request
and every background pass to one tenant. `TENANCY_MODE` selects where tenants come from:

| Mode       | Tenants                                                                                                                                  | Required variables                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`      | One tenant built from `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `PUBLIC_BASE_URL`, `CORS_ORIGINS` (default; rollback, local development, CI) | Unchanged                                                                                                                                      |
| `registry` | Tenants, hosts, modules and encrypted secrets from the control database                                                                  | `CONTROL_DATABASE_URL`, `CONTROL_ENCRYPTION_KEY` (32 bytes hex), optional `TENANT_POOL_MAX`, `REGISTRY_REFRESH_SECONDS`, `SUPPORT_TENANT_SLUG` |

In registry mode the API answers 404 `TENANT_NOT_FOUND` on an unknown host and 403
`TENANT_SUSPENDED` on a suspended tenant; `/health` and `/metrics` stay tenant-free. Each tenant's
bot receives updates on `/telegram/webhook/<tenantId>` at that tenant's API host. The pre-deploy
command `node packages/db/dist/migrate-tenants.js` migrates the control database and then every
non-archived tenant under an advisory lock; the first failure stops the deploy and names the tenant.

Pilot cutover procedure (production switched on 2026-09-21; spec AC-011–013):

1. Deploy with `TENANCY_MODE=env` and confirm no behavior change.
2. Create `vakhta_control` on the cluster; run `pnpm --filter @vakhta/registry migrate:js` with
   `CONTROL_DATABASE_URL` set; generate `CONTROL_ENCRYPTION_KEY` with `openssl rand -hex 32` and
   store it in 1Password and Railway.
3. Register the pilot: `pnpm --filter @vakhta/registry register-tenant -- --legacy-env --slug pilot --name "…"
--database-url "$DATABASE_URL" --api-host api.vakhta.xyz --panel-host panel.vakhta.xyz
--kiosk-host kiosk.vakhta.xyz --bot-token "$TELEGRAM_BOT_TOKEN" --bot-username
vakhta_worker_bot --webhook-secret "$TELEGRAM_WEBHOOK_SECRET" --storage-prefix ""`.
   The empty storage prefix keeps the pilot's historical media keys.
4. Set `TENANCY_MODE=registry`, `CONTROL_DATABASE_URL`, `CONTROL_ENCRYPTION_KEY` on `api` and
   `worker`; redeploy and verify the live journeys listed in the spec with the QA account.
   The existing host-bound `/telegram/webhook` remains supported in registry mode; preserve it
   during cutover and inspect `getWebhookInfo`. Moving to the per-tenant path is optional afterward.
5. Rollback: restore `TENANCY_MODE=env`; restore the host-bound webhook if its path changed.
   No tenant data moves in either direction.

### Tenant surface release ordering

The production panel and kiosk resolve `/public/tenant-config?host=...` from
`VITE_CONTROL_API_URL` before importing their application and transport modules. Unknown hosts,
suspended tenants and disabled surface modules fail closed. A validated host-specific cache lasts
at most 24 hours and is used only for network/server outages; explicit refusals invalidate it.
`VITE_API_URL` and `VITE_KIOSK_URL` are local-development settings. Production canonical/API/kiosk
origins come from the registry; register the base Pages aliases as non-primary verified domains
when preserving their canonical redirects. Unregistered preview hosts are intentionally refused.

For the initial runtime rollout, deploy the new control-api before uploading panel/kiosk assets.
Apply tenant migration 0052 to existing tenant databases before invitation inspection/acceptance.
The control service's own pre-deploy command migrates only the registry. The Pages job checks the
live pilot panel/kiosk configuration against its current contract before publishing; a parallel
Railway deployment is not proof of readiness.

Register the historical env tenant with `--legacy-env`: this reserves ENV_TENANT_ID and preserves
unprefixed Redis/storage keys, API authentication origins and existing sessions. Supply secrets
through TENANT_DATABASE_URL/TENANT_BOT_TOKEN/TENANT_WEBHOOK_SECRET in the process environment,
not command arguments. Other tenants keep random IDs and isolated prefixes. Before switching,
back up and restore the pilot database, rehearse env/registry/rollback, and inspect legacy BullMQ
waiting, active, delayed and failed jobs. Never silently assign unscoped jobs to a new tenant.

Onboarding is a POST-only public control flow, bound to the invitation's verified panel host,
ACTIVE tenant and enabled ADMIN_PANEL module. Operator cookies are omitted. A durable
onboarding_consumptions row commits with the tenant password update and session revocation;
then the registry marks the invitation used and records audit. Both inspection and acceptance
reconcile an interrupted registry commit without changing the password again. Expired unused
links fail closed. The owner sets the new password; operators share the onboarding link from
the tenant workspace. Bot connection may follow panel onboarding.
