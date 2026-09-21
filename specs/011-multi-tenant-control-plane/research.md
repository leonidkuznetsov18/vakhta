# Research: isolation model and provider facts

**Change**: 011-multi-tenant-control-plane | **Date**: 2026-09-21 | **Baseline**: 0566952

This note records the architecture options compared for the owner's requirement ("each client has
its own database, bot, kiosk and branded interface, created from a super-admin panel") and the
provider facts that the plan still has to verify. Facts about the repository are checked against
the baseline; provider claims are marked **verify** until a task confirms them.

## Options compared

| Criterion                               | A. One deployment per tenant                    | B. Database per tenant, shared compute (chosen)        | C. Shared database with `tenant_id`                 |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Meets "own database, bot, kiosk"        | Yes                                             | Yes                                                    | No: one database                                    |
| Code change in the product              | Almost none                                     | Tenant context in API/worker; schema unchanged         | Every table, query, index, test and report          |
| Access-boundary risk                    | Physical isolation                              | Isolation by database handle; fail-closed context      | One missing predicate leaks another customer's data |
| Cost per new tenant                     | API + worker + Postgres + Redis services        | One database on the shared cluster, hostnames, one bot | Zero infrastructure                                 |
| Provisioning without deploy             | No: needs Railway services, env, Pages projects | Yes: registry rows + `CREATE DATABASE` + migrate + DNS | Yes                                                 |
| Migrations and backups                  | N pipelines                                     | One pipeline iterating tenants                         | One pipeline                                        |
| Blast radius of a bug                   | One tenant                                      | All tenants for compute; data stays separate           | All tenants, including data                         |
| Dedicated tier for a large client later | Native                                          | Registry row pointing at another cluster or API base   | Requires extracting data                            |
| Fits "adoption in days" KPI             | Only with heavy automation                      | Yes                                                    | Yes                                                 |

Decision: **B**. It satisfies the owner's isolation requirement literally, leaves the fifty-plus
tenant tables and their invariant tests untouched, and keeps one deployment pipeline. Option A stays
the fallback for a client that contractually needs dedicated compute: the registry already models a
per-tenant database URL and API host, so such a tenant differs only by data. Option C is rejected
because it contradicts the owner's requirement and turns every query into an access-boundary risk.

## Sub-decisions inside option B

| Question                                  | Decision                                                                                                                                                               | Rejected alternative and reason                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How a request finds its tenant            | By the request host. Panel, kiosk and API each have a tenant hostname; a registry table maps host to tenant and surface.                                               | `Origin` or a custom header: not present on webhooks and kiosk devices, spoofable by non-browser clients, and shares one cookie domain for all tenants. |
| How the tenant reaches 94 injection sites | `AsyncLocalStorage` holds the tenant context; the global `DATABASE` token becomes a proxy that forwards to the current tenant's Drizzle client and throws without one. | Threading an explicit context parameter through every service: safer at the type level but a repository-wide rewrite with no behavior gain.             |
| Auth per tenant                           | One better-auth instance per tenant, created lazily from the tenant's database and cached in the runtime map; cookies are per tenant host.                             | One auth instance over all tenants: sessions would live in one database, breaking "own database".                                                       |
| Telegram bot                              | One grammY bot per tenant; webhook path carries the tenant id and a per-tenant secret; dev polling starts one poller per tenant with a token.                          | One bot for all tenants: contradicts the requirement and mixes employee identities.                                                                     |
| Bot creation                              | Operator creates the bot in BotFather and pastes the token; the platform validates with `getMe` and sets the webhook.                                                  | Automatic creation: Telegram has no Bot API method to create bots.                                                                                      |
| Redis                                     | Shared instance, every key prefixed `t:<tenantId>:` through the existing short-term store wrapper; BullMQ queues shared, every job carries `tenantId`.                 | One Redis per tenant: cost without an isolation gain for short-lived keys.                                                                              |
| Object storage                            | Shared bucket, keys prefixed `tenants/<slug>/`; pilot keys stay as stored (`storageKey` is absolute).                                                                  | One bucket per tenant: possible later per tenant through the registry; not needed for v1.                                                               |
| Panel and kiosk builds                    | One static build; at boot the app asks the control plane's public endpoint for its host's API base and branding, and caches the last good answer in browser storage.   | One build per tenant: N Pages projects and CI jobs. Cloudflare KV + Pages Function: workable, but duplicates the registry into a second store.          |
| Control plane placement                   | Separate `control-api` service and `control-web` static app from this repository; provider tokens and the database admin URL exist only in the control service.        | Same process as the tenant API: cheaper, but provisioning secrets would sit in the process that serves tenant traffic.                                  |
| PostgreSQL topology                       | One Railway Postgres service, one database per tenant (`vakhta_t_<slug>`), one role per tenant.                                                                        | One Postgres service per tenant: cost and provisioning through the Railway API on every tenant.                                                         |
| Secrets at rest                           | AES-256-GCM with a platform key (`CONTROL_ENCRYPTION_KEY`), key version stored per row for rotation.                                                                   | Plain text in the registry: backups and operator screens would expose bot tokens and database URLs.                                                     |
| Compatibility                             | `TENANCY_MODE=env` builds one tenant from the current variables; `registry` reads the control database. Both use the same context code.                                | Big-bang cutover: no rollback and no way to run CI without a control database.                                                                          |

## Provider facts to verify in the plan

| Fact                                                                                                        | Status     | Where it matters                                  |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- |
| Railway supports wildcard custom domains (`*.vakhta.xyz`) or per-host custom domains through its public API | **verify** | `api.<slug>.vakhta.xyz` without a deploy          |
| Cloudflare Pages custom domains can be added per project through the API; wildcards are not supported       | **verify** | `<slug>.vakhta.xyz` and `kiosk.<slug>.vakhta.xyz` |
| Cloudflare proxied wildcard records and Railway TLS interact without an advanced certificate                | **verify** | Choice between wildcard and per-host registration |
| Railway Postgres connection limit and whether a pooler is available                                         | **verify** | Per-tenant pool budget in API and worker          |
| `postgres` (postgres.js) pool per tenant with `max` small enough for the connection budget                  | repository | `packages/db/src/client.ts` already exposes `max` |
| Telegram `setWebhook` accepts `secret_token` and a path per bot                                             | known      | `/telegram/webhook/<tenantId>`                    |
| Node `AsyncLocalStorage` survives Fastify hooks, Nest guards, pipes and SSE responses                       | **verify** | Tenant context proxy                              |
| Drizzle migrator has no cross-process lock                                                                  | repository | Wrap per-tenant migration in `pg_advisory_lock`   |

Sources to consult during verification (official documentation only): Railway public networking and
custom domains, Cloudflare Pages custom domains and DNS API, Telegram Bot API `setWebhook`, Node.js
`async_context`, PostgreSQL `CREATE DATABASE` and advisory locks, better-auth configuration.

## What the current code already gives us

- Sites, units, teams, zones and positions model a customer's internal structure; nothing changes there.
- `ENTERPRISE` scope already means "the whole customer"; it becomes "the whole tenant" with no code change.
- `settings` keyed by `global` or a site id is per tenant automatically once the database is per tenant.
- `background_tasks`, the notification outbox and the event store are per tenant automatically.
- Kiosk pairing, activation codes and `bootstrap-admin.ts` are the building blocks of provisioning steps.
- `docs/runbooks/platform-operations.md` records which provider credentials exist and their scope.
