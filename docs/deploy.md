# Production: environments, services, first run

Checklist of what exists and how it is operated. Cloudflare Pages hosts the static panel and kiosk; the API and the worker run as containers on Railway together with Postgres and Redis, because the bot webhook, the SSE stream of the panel and BullMQ need long-lived processes. Everything Railway-side is declared in `.railway/railway.ts` (infrastructure as code); Cloudflare-side resources are created with `wrangler`.

## 1. Two environments

| What           | dev (local)                                             | prod                                                                                                     |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Configuration  | `.env` from `.env.example`; `node --env-file-if-exists` | Railway service variables (template: `.env.production.example`); no `.env*` files in the container       |
| Startup check  | `change-me` placeholders allowed                        | `NODE_ENV=production` requires https, webhook, real secrets, `S3_*`, `METRICS_TOKEN`                     |
| Infrastructure | `pnpm infra:up`: Postgres, Redis, MinIO in Docker       | Railway Postgres 18 and Redis on the private network, Cloudflare R2                                      |
| Telegram       | `TELEGRAM_MODE=polling`, no public address              | `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_SECRET`, webhook set from inside the container                |
| Panel cookie   | http, `SameSite=Lax`                                    | https, `Secure`; `AUTH_COOKIE_SAME_SITE=lax` under one domain, `none` while on `pages.dev`/`railway.app` |
| Migrations     | `pnpm db:migrate` (drizzle-kit)                         | `node packages/db/dist/migrate.js` as the Railway pre-deploy command, same journal                       |
| `/metrics`     | open                                                    | only with `Authorization: Bearer <METRICS_TOKEN>`                                                        |
| Errors         | pino-pretty in the console                              | pino JSON in Railway logs, Sentry when `SENTRY_DSN` is set                                               |
| Build          | `pnpm dev` (tsc --watch, Vite)                          | `apps/api/Dockerfile`, `apps/worker/Dockerfile` built by Railway; Vite `dist` uploaded to Pages          |

## 2. What exists

| Component              | Service                                                        | Notes                                                                                |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API `apps/api`         | Railway project `vakhta`, service `api`, region `europe-west4` | Dockerfile build, pre-deploy migrations, `/health` check, public domain, `PORT=3000` |
| Worker `apps/worker`   | Railway service `worker`                                       | Dockerfile build, no public port, restart `ALWAYS`                                   |
| PostgreSQL 18          | Railway `Postgres` (`postgres-ssl:18`)                         | private endpoint `postgres`; a TCP proxy exists only for the nightly dump            |
| Redis 8                | Railway `Redis`                                                | private endpoint `redis`, `--save 60 1` on a volume                                  |
| Panel `apps/admin-web` | Cloudflare Pages project `vakhta-panel`                        | `https://panel.vakhta.xyz`; the `pages.dev` host redirects there                     |
| Kiosk `apps/qr-kiosk`  | Cloudflare Pages project `vakhta-kiosk`                        | `https://kiosk.vakhta.xyz`; the tablet pairs with a code from the panel               |
| Photos, medical files  | Cloudflare R2 bucket `vakhta-media` (private, WEUR)            | S3 API keys with Object Read & Write on both buckets                                 |
| Database backups       | Cloudflare R2 bucket `vakhta-backups`                          | lifecycle rule `expire-30d` on `postgres/`                                           |
| Images                 | GHCR `ghcr.io/leonidkuznetsov18/vakhta-api`, `…-worker`        | published by CI from `master`, used for rollback and for other hosts                 |
| Telegram bot           | BotFather                                                      | webhook `https://<api domain>/telegram/webhook` with a secret header                 |
| Errors                 | Sentry (optional)                                              | set `SENTRY_DSN` on api and worker                                                   |

## 3. Variables

Template with comments: `.env.production.example`. Secrets are generated with `openssl rand -base64 48` and live only in Railway variables (`railway variables --service api --set KEY=VALUE`). `DATABASE_URL` and `REDIS_URL` are references `${{Postgres.DATABASE_URL}}` / `${{Redis.REDIS_URL}}` to the private network. GitHub repository secrets for the backup workflow: `PROD_DATABASE_URL` (through the TCP proxy, `sslmode=require`), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`; repository variable `DB_BACKUP_ENABLED=true`.

## 4. How it was brought up (repeatable)

1. `railway login`, `wrangler login` in a terminal (OAuth in the browser).
2. `railway init --name vakhta`, `railway add --database postgres`, `railway add --database redis`, `railway add --service api`, `railway add --service worker`, `railway domain --service api`.
3. Variables for api and worker with `railway variables --set …` (see section 3), then `railway service source connect --repo leonidkuznetsov18/vakhta --branch master --service api` (and worker).
4. `railway config plan` and `railway config apply --yes` from `.railway/railway.ts`: Dockerfile builds, pre-deploy migrations, health check, restart policies, region, Postgres TCP proxy. Re-run after every change to the file; `railway config pull --force` re-imports drift (secrets stay `preserve()`).
5. The public domain must route to port 3000: `railway domain update <domain> --service api --port 3000` and `PORT=3000` in the variables.
6. One-off commands run inside the api container (register a key once with `railway ssh keys add` and trust `ssh.railway.com`):

   ```bash
   railway ssh --service api -- node packages/db/dist/seed.js
   railway ssh --service api -- node apps/api/dist/cli/bootstrap-admin.js --email admin@example.com --password '<long password>' --name 'Admin'
   railway ssh --service api -- node apps/api/dist/cli/set-webhook.js
   ```

7. Cloudflare: enable R2, `wrangler r2 bucket create vakhta-media --location weur`, the same for `vakhta-backups`, `wrangler r2 bucket lifecycle add vakhta-backups --name expire-30d --prefix postgres/ --expire-days 30`; create an R2 API token (Object Read & Write, both buckets) in the dashboard and put its keys into `S3_ACCESS_KEY` / `S3_SECRET_KEY` of api and worker.
8. Pages: `wrangler pages project create vakhta-panel --production-branch master`, build with `VITE_API_URL=https://<api domain> pnpm --filter admin-web run build`, then `wrangler pages deploy apps/admin-web/dist --project-name vakhta-panel --branch master`. The kiosk is the same build without any token: on the tablet, open the kiosk address and type the pairing code from "Administration → Terminals" (the panel also prints a link with the code when it is built with `VITE_KIOSK_URL`). `public/_headers` adds the security headers.
9. Backups: secrets from section 3, then run the "DB backup" workflow once by hand and check the object in `vakhta-backups`.

## 5. CI/CD on every push to master

`.github/workflows/ci.yml` runs four jobs: **check** (build, typecheck, lint, format, tests with testcontainers), **release**, **images** and **pages**. Pull requests run only the check and a throwaway image build.

- **release**: `semantic-release` reads Conventional Commits since the last tag. `feat` bumps the minor version, `fix`/`perf`/`refactor`/`config`/`infra` the patch, `docs`/`ci`/`chore`/`test` publish nothing. A release updates the root `package.json` version and `CHANGELOG.md` in a `chore(release): vX.Y.Z [skip ci]` commit, creates the tag `vX.Y.Z` and a GitHub Release with the notes (`.releaserc.json`).
- **images**: builds `apps/api` and `apps/worker` and pushes `ghcr.io/leonidkuznetsov18/vakhta-{api,worker}` with tags `sha-<commit>`, `latest` and, when a release was published, `vX.Y.Z`.
- **pages**: builds the panel and the kiosk with `VITE_API_URL` (repository variable `API_URL`), `VITE_CANONICAL_ORIGIN` (variables `PANEL_URL` and `KIOSK_URL`; Pages cannot redirect a whole `pages.dev` host itself, so the apps do it on load), `VITE_APP_VERSION` and, for the panel, `VITE_KIOSK_URL` (variable `KIOSK_URL`, used only to print pairing links) and deploys them with `wrangler pages deploy` using secret `CLOUDFLARE_API_TOKEN` (permission "Cloudflare Pages: Edit") and variable `CLOUDFLARE_ACCOUNT_ID`. Without the token the job builds and skips the deploy with a warning.
- **Railway** deploys `api` and `worker` from `master` on its own and, with `checkSuites: true`, only after the GitHub check suite is green; `watchPatterns` skip rebuilds for commits that touch only docs or the changelog. Rollback: "Redeploy" of a previous deployment in Railway or the `sha-…` image tag.

The version shown in the panel navigation comes from the release that built it.

## 6. Custom domain

Done for `vakhta.xyz` (Cloudflare DNS, all three records proxied, Railway custom domain active). Without a shared domain the panel (`pages.dev`) and the API (`railway.app`) are different sites, so the session cookie needs `AUTH_COOKIE_SAME_SITE=none`, which Safari and iOS block. The steps for a domain: `panel.<domain>` and `kiosk.<domain>` as Pages custom domains, `api.<domain>` through `railway domain api.<domain> --service api`, then `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `AUTH_COOKIE_SAME_SITE=lax`, a rebuild of the panel and kiosk with the new `VITE_API_URL`, and `set-webhook` again.

## 7. Backups and recovery

- Railway keeps the Postgres volume; independently, `.github/workflows/db-backup.yml` runs `scripts/db/backup.sh` every night at 02:30 UTC with the PostgreSQL 18 client and uploads `postgres/vakhta-<UTC>.dump` to `vakhta-backups`.
- Restore: `scripts/db/restore.sh <dump or s3://…> <DATABASE_URL of an empty database>`; order and drills in `docs/runbooks/recovery.md`.

## 8. Monitoring and errors

- `GET /health` for uptime checks; `GET /metrics` with `Authorization: Bearer <METRICS_TOKEN>` for Prometheus or Grafana Cloud, rules in `infra/monitoring/prometheus-alerts.yml`.
- Sentry receives only unexpected errors; authorization headers, cookies and the webhook secret are scrubbed.
- Logs: `railway logs --service api` (add `--build` or `--deployment`).

## 9. Known limits

- One API replica: the SSE change buses are in-process. For several replicas move them to Redis pub/sub.
- `/metrics` is protected by a token, not by the network.
- The kiosk keeps its device token in the tablet's browser storage after pairing. Re-pairing (a new code from the panel) rotates the token and invalidates the old one; clearing the browser data on the tablet means pairing again. No rebuild is involved.

## 10. Before announcing the pilot

- Walk through `docs/runbooks/deploy.md`, `recovery.md` (one restore drill), `observability.md`, `reserve-channel.md`.
- Review `docs/parameters.md` after the first weeks.
- Legal review of personal data and labour rules (spec 13, 18 item 20), consent text at activation.
- Load run of `infra/load/k6-shift-boundary.js` against the production API outside working hours with the numbers from `docs/parameters.md`.
