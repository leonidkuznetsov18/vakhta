# Data model: control registry

**Change**: 011-multi-tenant-control-plane | **Date**: 2026-09-21

The registry lives in its own PostgreSQL database (`vakhta_control`) owned by `packages/registry`.
Tenant databases keep the existing `packages/db` schema without a `tenant_id` column anywhere.
Rules C5, C6 and C9 apply: `snake_case`, `timestamptz`, `uuid`, invariants in SQL, append-only
audit, every code set as one `as const` object with `z.enum` and `pgEnum`.

## Enumerations

| Code set            | Values                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenant_status`     | `DRAFT`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`                                                                                                                                             |
| `tenant_module`     | `ADMIN_PANEL`, `WORKER_BOT`, `QR_KIOSK`, `SUPPORT_BOT` (reserved), `PHOTO_INSPECTION` (reserved)                                                                                                       |
| `module_status`     | `ENABLED`, `DISABLED`                                                                                                                                                                                  |
| `tenant_surface`    | `PANEL`, `KIOSK`, `API`                                                                                                                                                                                |
| `domain_status`     | `PENDING`, `VERIFIED`, `FAILED`                                                                                                                                                                        |
| `secret_kind`       | `DATABASE_URL`, `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`                                                                                                                                                      |
| `operator_role`     | `PLATFORM_ADMIN`, `PLATFORM_VIEWER`                                                                                                                                                                    |
| `provisioning_kind` | `PROVISION`, `ENABLE_MODULE`, `DISABLE_MODULE`, `SUSPEND`, `RESUME`, `ROTATE_BOT_TOKEN`, `VERIFY_DOMAIN`, `MIGRATE`, `BACKUP`, `DELETE`                                                                |
| `job_status`        | `PENDING`, `RUNNING`, `DONE`, `FAILED`, `CANCELLED`                                                                                                                                                    |
| `provisioning_step` | `CREATE_DATABASE`, `MIGRATE`, `SEED_DEFAULTS`, `STORAGE_PREFIX`, `REGISTER_DOMAINS`, `BOT_WEBHOOK`, `INVITE_ADMIN`, `REMOVE_WEBHOOK`, `EVICT_RUNTIME`, `FINAL_BACKUP`, `DROP_DATABASE`, `DROP_STORAGE` |
| `invitation_kind`   | `ONBOARDING`, `ADMIN`                                                                                                                                                                                  |
| `step_status`       | `PENDING`, `RUNNING`, `DONE`, `FAILED`, `SKIPPED`, `MANUAL_REQUIRED`                                                                                                                                   |

Tenant status transitions are a small FSM in `packages/domain` (pure): `DRAFT → PROVISIONING →
ACTIVE ↔ SUSPENDED`, `ACTIVE|SUSPENDED → ARCHIVED`. `ARCHIVED` is the state of a tenant whose deletion was
requested; the database and storage are dropped after the retention window (`tenant_deletions`).

## Tables

### tenants

| Column             | Type          | Constraint                                                                                           |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `id`               | uuid pk       | default random                                                                                       |
| `slug`             | text          | unique; `CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$')`; immutable (trigger or app rule + test) |
| `name`             | text          | legal or working name shown to operators                                                             |
| `status`           | tenant_status | default `DRAFT`                                                                                      |
| `default_locale`   | locale        | `uk`, `en`, `ru`; default `ru` (NFR-08)                                                              |
| `timezone`         | text          | IANA; seeds the first site                                                                           |
| `storage_prefix`   | text          | unique; `tenants/<slug>/`                                                                            |
| `database_name`    | text          | unique; `vakhta_t_<slug>`                                                                            |
| `schema_version`   | text          | last migration tag applied; null until migrated                                                      |
| `migrated_at`      | timestamptz   |                                                                                                      |
| `suspended_at`     | timestamptz   | non-null iff status `SUSPENDED`                                                                      |
| `suspended_reason` | text          |                                                                                                      |
| `created_by`       | uuid          | operator                                                                                             |
| `created_at`       | timestamptz   | default now                                                                                          |
| `updated_at`       | timestamptz   | bumped on every change; drives registry refresh                                                      |

Reserved slugs (`api`, `kiosk`, `panel`, `control`, `www`, `mail`, `admin`, `static`, `cdn`) are a
constant in `packages/domain` and enforced by the same validator on the API and in the panel.

### tenant_branding

| Column         | Type        | Constraint                                           |
| -------------- | ----------- | ---------------------------------------------------- |
| `tenant_id`    | uuid pk fk  | references tenants                                   |
| `display_name` | text        | shown in panel, kiosk and bot greeting               |
| `logo_key`     | text        | object key under the tenant storage prefix; nullable |
| `accent_color` | text        | `CHECK (accent_color ~ '^#[0-9a-f]{6}$')`; nullable  |
| `updated_at`   | timestamptz |                                                      |

### tenant_modules

| Column        | Type          | Constraint                                 |
| ------------- | ------------- | ------------------------------------------ |
| `tenant_id`   | uuid fk       |                                            |
| `module`      | tenant_module |                                            |
| `status`      | module_status | default `ENABLED`                          |
| `config`      | jsonb         | validated by a per-module zod schema; `{}` |
| `enabled_at`  | timestamptz   |                                            |
| `disabled_at` | timestamptz   |                                            |
|               |               | `PRIMARY KEY (tenant_id, module)`          |

### tenant_domains

| Column        | Type           | Constraint                                                                    |
| ------------- | -------------- | ----------------------------------------------------------------------------- |
| `id`          | uuid pk        |                                                                               |
| `tenant_id`   | uuid fk        |                                                                               |
| `host`        | text           | unique, lowercase, no port; `CHECK (host = lower(host))`                      |
| `surface`     | tenant_surface |                                                                               |
| `is_primary`  | boolean        | partial unique `(tenant_id, surface) WHERE is_primary`                        |
| `is_managed`  | boolean        | true for platform hostnames created by provisioning; false for client domains |
| `status`      | domain_status  | default `PENDING`; API serves only `VERIFIED` hosts                           |
| `verified_at` | timestamptz    |                                                                               |
| `created_at`  | timestamptz    |                                                                               |

Every `ACTIVE` tenant has exactly one primary `API` host; the panel and kiosk hosts exist only when
the corresponding module is enabled. This is enforced in the provisioning transaction and tested.

### tenant_secrets

| Column        | Type        | Constraint                                                                          |
| ------------- | ----------- | ----------------------------------------------------------------------------------- |
| `tenant_id`   | uuid fk     |                                                                                     |
| `kind`        | secret_kind |                                                                                     |
| `ciphertext`  | bytea       | AES-256-GCM; nonce and tag included                                                 |
| `key_version` | integer     | which platform key encrypted it                                                     |
| `fingerprint` | text        | HMAC of the plaintext for duplicate detection (bot token uniqueness across tenants) |
| `updated_by`  | uuid        |                                                                                     |
| `updated_at`  | timestamptz |                                                                                     |
|               |             | `PRIMARY KEY (tenant_id, kind)`; unique `(kind, fingerprint)`                       |

The tenant API and worker hold the decryption key so they can open tenant databases and bots; they
never hold the provider tokens or the cluster admin URL, which exist only in `control-api` env.

### operators and control auth

`operators(id, email unique, name, role operator_role, status ACTIVE|DISABLED, created_at, updated_at)`
plus the better-auth tables prefixed `control_auth_*` (user, session, account, verification,
two_factor) in this database. TOTP is mandatory: a session without a verified second factor cannot
call any control route. Self sign-up is disabled; the first operator is created by a CLI command.

### provisioning_jobs and provisioning_steps

`provisioning_jobs(id, tenant_id fk, kind provisioning_kind, status job_status, requested_by uuid,
payload jsonb, error text, created_at, started_at, finished_at)` with a partial unique index
`(tenant_id) WHERE status IN ('PENDING','RUNNING')`: one active job per tenant.

`provisioning_steps(job_id fk, step provisioning_step, seq integer, status step_status, attempts
integer default 0, last_error text, output jsonb, started_at, finished_at, PRIMARY KEY (job_id, step))`.
Steps run in `seq` order; `MANUAL_REQUIRED` carries instructions in `output` (for example the DNS
record to create when no provider token is configured) and blocks the job until an operator marks
it done or retries after configuring the provider.

### tenant_invitations

| Column        | Type            | Constraint                                                        |
| ------------- | --------------- | ----------------------------------------------------------------- |
| `id`          | uuid pk         |                                                                   |
| `tenant_id`   | uuid fk         |                                                                   |
| `kind`        | invitation_kind | `ONBOARDING` opens the welcome page; `ADMIN` only sets a password |
| `token_hash`  | text            | unique; HMAC of the token with the platform key                   |
| `admin_email` | text            | the administrator created in the tenant database                  |
| `expires_at`  | timestamptz     | seven days after issue                                            |
| `used_at`     | timestamptz     | set once when the password is saved                               |
| `issued_by`   | uuid            | operator                                                          |
| `created_at`  | timestamptz     |                                                                   |

Reissuing creates a new row and expires the previous unused one.

### tenant_deletions

| Column             | Type        | Constraint                                                  |
| ------------------ | ----------- | ----------------------------------------------------------- |
| `tenant_id`        | uuid pk fk  |                                                             |
| `requested_by`     | uuid        | operator who typed the slug                                 |
| `requested_at`     | timestamptz |                                                             |
| `scheduled_for`    | timestamptz | requested_at plus the retention window                      |
| `final_backup_key` | text        | object key of the final dump; required before the drop      |
| `restored_at`      | timestamptz | set when an operator cancels the deletion within the window |
| `dropped_at`       | timestamptz | set by the drop step                                        |

### Module configuration schemas

`tenant_modules.config` is validated by one zod schema per module in `packages/contracts`:
`ADMIN_PANEL` `{}`; `WORKER_BOT` `{ botUsername: string | null }` (token and webhook secret are
secrets; webhook status is derived at read time); `QR_KIOSK` `{ qrRotationSeconds, qrTtlSeconds }`.
Unknown keys are rejected.

### Tenant settings keys (tenant database, `settings` table, scope `global`)

The key catalog lives in `packages/contracts/src/tenant-settings.ts` with a zod schema and a
platform default per key. Initial keys mirror `docs/parameters.md` and the env variables they
replace: presence windows, early start, grace, breaks and meals, service time, downtime escalation,
incident SLA per severity and duplicate window, cleaning reminder, handover review window, QR
rotation and TTL, media thresholds and retention, appeal window. Values are validated on write by
`control-api` and on read by the tenant API; an invalid stored value falls back to the default and
is reported.

### control_audit_log (append-only, C6)

`control_audit_log(id bigserial, at timestamptz, actor_id uuid, actor_email text, action text,
tenant_id uuid, object_type text, object_id text, before jsonb, after jsonb, request_id text)`.
Secrets are never stored: the audit of a secret change records only kind, key version and fingerprint
prefix. A migration adding UPDATE or DELETE grants on this table does not pass review.

## Runtime contracts (packages/contracts)

```ts
// Public, unauthenticated, cacheable: what a panel or kiosk needs before sign-in.
TenantPublicConfig = { slug, surface, apiUrl, displayName, logoUrl: string | null,
  accentColor: string | null, defaultLocale, modules: TenantModule[], status: 'ACTIVE' | 'SUSPENDED' }

// Added to MeView for the signed-in panel user.
MeView.tenant = { slug, displayName, modules: TenantModule[] }

// Every queue job payload.
{ tenantId: Uuid, ...existing fields }
```

`TenantRuntimeConfig` (internal, `packages/registry`) adds the decrypted database URL, bot token,
webhook secret, storage prefix and Redis prefix; it never crosses a process boundary or a log line.

## Tenant-database touchpoints

No schema change. Provisioning writes through existing code: `seedTenantDefaults` (positions, reason
codes, shift templates, first site with the tenant time zone), `auth_user` + `web_user_roles`
(`ADMIN`, `ENTERPRISE`) for the first administrator, and nothing else. Employees, terminals and
schedules are created by the tenant's own administrator in the tenant panel, as today.
