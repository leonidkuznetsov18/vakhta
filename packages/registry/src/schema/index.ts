import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Control registry (specs/011, data-model.md). Lives in its own database; tenant databases keep
 * the product schema untouched. Every writer bumps `tenants.updated_at`, which drives refresh.
 *
 * Enum values mirror the constants in @vakhta/domain (schema.test.ts asserts equality): drizzle-kit
 * loads this file through CommonJS and cannot import the ESM-only domain package.
 */
export const TENANT_STATUS_VALUES = [
  'DRAFT',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
] as const;
export const TENANT_MODULE_VALUES = [
  'ADMIN_PANEL',
  'WORKER_BOT',
  'QR_KIOSK',
  'SUPPORT_BOT',
  'PHOTO_INSPECTION',
] as const;
export const TENANT_SURFACE_VALUES = ['PANEL', 'KIOSK', 'API'] as const;
export const DOMAIN_STATUS_VALUES = ['PENDING', 'VERIFIED', 'FAILED'] as const;
export const SECRET_KIND_VALUES = ['DATABASE_URL', 'BOT_TOKEN', 'BOT_WEBHOOK_SECRET'] as const;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const tenantStatus = pgEnum('tenant_status', TENANT_STATUS_VALUES);
export const tenantModule = pgEnum('tenant_module', TENANT_MODULE_VALUES);
export const moduleStatus = pgEnum('module_status', ['ENABLED', 'DISABLED']);
export const tenantSurface = pgEnum('tenant_surface', TENANT_SURFACE_VALUES);
export const domainStatus = pgEnum('domain_status', DOMAIN_STATUS_VALUES);
export const secretKind = pgEnum('secret_kind', SECRET_KIND_VALUES);
export const registryLocale = pgEnum('registry_locale', ['uk', 'en', 'ru']);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: tenantStatus('status').notNull().default('DRAFT'),
    defaultLocale: registryLocale('default_locale').notNull().default('ru'),
    timezone: text('timezone').notNull(),
    storagePrefix: text('storage_prefix').notNull().unique(),
    databaseName: text('database_name').notNull().unique(),
    schemaVersion: text('schema_version'),
    migratedAt: timestamp('migrated_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tenants_status_idx').on(t.status),
    check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'`),
    check(
      'tenants_suspended_consistent',
      sql`(${t.status} = 'SUSPENDED') = (${t.suspendedAt} IS NOT NULL)`,
    ),
  ],
);

export const tenantBranding = pgTable(
  'tenant_branding',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    logoKey: text('logo_key'),
    accentColor: text('accent_color'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'tenant_branding_accent_format',
      sql`${t.accentColor} IS NULL OR ${t.accentColor} ~ '^#[0-9a-f]{6}$'`,
    ),
  ],
);

export const tenantModules = pgTable(
  'tenant_modules',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    module: tenantModule('module').notNull(),
    status: moduleStatus('status').notNull().default('ENABLED'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.module] })],
);

export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    host: text('host').notNull().unique(),
    surface: tenantSurface('surface').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    isManaged: boolean('is_managed').notNull().default(true),
    status: domainStatus('status').notNull().default('PENDING'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('tenant_domains_tenant_idx').on(t.tenantId),
    uniqueIndex('tenant_domains_primary_uq')
      .on(t.tenantId, t.surface)
      .where(sql`${t.isPrimary}`),
    check('tenant_domains_host_lowercase', sql`${t.host} = lower(${t.host})`),
  ],
);

export const tenantSecrets = pgTable(
  'tenant_secrets',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: secretKind('kind').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    keyVersion: integer('key_version').notNull(),
    /** HMAC of the plaintext: duplicate detection (one bot token serves one tenant) without decryption. */
    fingerprint: text('fingerprint').notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.kind] }),
    uniqueIndex('tenant_secrets_fingerprint_uq').on(t.kind, t.fingerprint),
  ],
);

/** Append-only (C6): the application role receives INSERT and SELECT only. */
export const controlAuditLog = pgTable(
  'control_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    tenantId: uuid('tenant_id'),
    objectType: text('object_type').notNull(),
    objectId: text('object_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
  },
  (t) => [index('control_audit_tenant_idx').on(t.tenantId, t.at)],
);

/* ------------------------------------------------------------------ */
/* Control panel (delivery 2): operators, provisioning, invitations     */
/* ------------------------------------------------------------------ */

export const OPERATOR_ROLE_VALUES = ['PLATFORM_ADMIN', 'PLATFORM_VIEWER'] as const;
export const OPERATOR_STATUS_VALUES = ['ACTIVE', 'DISABLED'] as const;
export const PROVISIONING_KIND_VALUES = [
  'PROVISION',
  'ENABLE_MODULE',
  'DISABLE_MODULE',
  'SUSPEND',
  'RESUME',
  'ROTATE_BOT_TOKEN',
  'VERIFY_DOMAIN',
  'MIGRATE',
  'BACKUP',
  'DELETE',
] as const;
export const JOB_STATUS_VALUES = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'] as const;
export const PROVISIONING_STEP_VALUES = [
  'CREATE_DATABASE',
  'MIGRATE',
  'SEED_DEFAULTS',
  'STORAGE_PREFIX',
  'REGISTER_DOMAINS',
  'BOT_WEBHOOK',
  'INVITE_ADMIN',
  'REMOVE_WEBHOOK',
  'EVICT_RUNTIME',
  'FINAL_BACKUP',
  'DROP_DATABASE',
  'DROP_STORAGE',
] as const;
export const STEP_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
  'SKIPPED',
  'MANUAL_REQUIRED',
] as const;
export const INVITATION_KIND_VALUES = ['ONBOARDING', 'ADMIN'] as const;

export const operatorRole = pgEnum('operator_role', OPERATOR_ROLE_VALUES);
export const operatorStatus = pgEnum('operator_status', OPERATOR_STATUS_VALUES);
export const provisioningKind = pgEnum('provisioning_kind', PROVISIONING_KIND_VALUES);
export const jobStatus = pgEnum('job_status', JOB_STATUS_VALUES);
export const provisioningStep = pgEnum('provisioning_step', PROVISIONING_STEP_VALUES);
export const stepStatus = pgEnum('step_status', STEP_STATUS_VALUES);
export const invitationKind = pgEnum('invitation_kind', INVITATION_KIND_VALUES);

/** better-auth tables of the control panel; operators are its users with a platform role. */
export const controlAuthUser = pgTable('control_auth_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  role: operatorRole('role').notNull().default('PLATFORM_VIEWER'),
  status: operatorStatus('status').notNull().default('ACTIVE'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const controlAuthSession = pgTable(
  'control_auth_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    userId: uuid('user_id')
      .notNull()
      .references(() => controlAuthUser.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('control_auth_session_user_idx').on(t.userId)],
);

export const controlAuthAccount = pgTable(
  'control_auth_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => controlAuthUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    issuer: text('issuer'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('control_auth_account_user_idx').on(t.userId)],
);

export const controlAuthVerification = pgTable(
  'control_auth_verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('control_auth_verification_identifier_idx').on(t.identifier)],
);

export const controlAuthTwoFactor = pgTable(
  'control_auth_two_factor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => controlAuthUser.id, { onDelete: 'cascade' }),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [
    index('control_auth_two_factor_user_idx').on(t.userId),
    index('control_auth_two_factor_secret_idx').on(t.secret),
  ],
);

/** One active job per tenant; steps run in `seq` order and survive a process restart. */
export const provisioningJobs = pgTable(
  'provisioning_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: provisioningKind('kind').notNull(),
    status: jobStatus('status').notNull().default('PENDING'),
    requestedBy: uuid('requested_by'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('provisioning_jobs_tenant_idx').on(t.tenantId, t.createdAt),
    uniqueIndex('provisioning_jobs_active_uq')
      .on(t.tenantId)
      .where(sql`${t.status} IN ('PENDING', 'RUNNING')`),
  ],
);

export const provisioningSteps = pgTable(
  'provisioning_steps',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => provisioningJobs.id, { onDelete: 'cascade' }),
    step: provisioningStep('step').notNull(),
    seq: integer('seq').notNull(),
    status: stepStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    output: jsonb('output').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.step] })],
);

/** Onboarding and password-setup links; the token itself is never stored. */
export const tenantInvitations = pgTable(
  'tenant_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: invitationKind('kind').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    adminEmail: text('admin_email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    issuedBy: uuid('issued_by'),
    createdAt: createdAt(),
  },
  (t) => [index('tenant_invitations_tenant_idx').on(t.tenantId)],
);

export const tenantDeletions = pgTable('tenant_deletions', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  finalBackupKey: text('final_backup_key'),
  restoredAt: timestamp('restored_at', { withTimezone: true }),
  droppedAt: timestamp('dropped_at', { withTimezone: true }),
});
