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

Consumer source `e17b431` requires separate deployment and recovery verification; foundation success
alone is not evidence that media jobs or other required background effects are being consumed.
