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
