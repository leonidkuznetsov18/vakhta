import {
  DELIVERED_TENANT_MODULES,
  LOCALES,
  TENANT_MODULES,
  TENANT_SLUG_PATTERN,
} from '@vakhta/domain';
import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';
import {
  TenantAccentColor,
  TenantModuleSchema,
  TenantStatusSchema,
  TenantSurfaceSchema,
} from './tenant.js';

/** Control panel contracts (specs/011, delivery 2). Operators only; never exposed to tenants. */

export const OperatorRoleSchema = z.enum(['PLATFORM_ADMIN', 'PLATFORM_VIEWER']);
export const JobStatusSchema = z.enum(['PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED']);
export const StepStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
  'SKIPPED',
  'MANUAL_REQUIRED',
]);
export const ProvisioningKindSchema = z.enum([
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
]);
export const ProvisioningStepSchema = z.enum([
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
]);
export const DomainStatusSchema = z.enum(['PENDING', 'VERIFIED', 'FAILED']);

export const TenantSlug = z.string().regex(TENANT_SLUG_PATTERN);
export const BotToken = z.string().regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/);

export const CreateTenantCommand = z.object({
  name: z.string().trim().min(2).max(120),
  slug: TenantSlug,
  displayName: z.string().trim().min(2).max(120).optional(),
  defaultLocale: z.enum(LOCALES),
  timezone: z.string().min(1),
  modules: z.array(TenantModuleSchema).min(1),
  adminEmail: z.email(),
  adminName: z.string().trim().min(2).max(120),
  botToken: BotToken.optional(),
  botUsername: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .optional(),
  /** Start provisioning at once (the quick-create wizard). */
  provision: z.boolean().default(true),
});
export type CreateTenantCommand = z.infer<typeof CreateTenantCommand>;

export const UpdateTenantCommand = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  accentColor: TenantAccentColor.nullable().optional(),
  defaultLocale: z.enum(LOCALES).optional(),
  timezone: z.string().min(1).optional(),
});
export type UpdateTenantCommand = z.infer<typeof UpdateTenantCommand>;

export const SetModuleCommand = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type SetModuleCommand = z.infer<typeof SetModuleCommand>;

export const AddDomainCommand = z.object({
  host: z.string().trim().toLowerCase().min(3).max(253),
  surface: TenantSurfaceSchema,
  isPrimary: z.boolean().default(false),
});
export type AddDomainCommand = z.infer<typeof AddDomainCommand>;

export const SetBotTokenCommand = z.object({ botToken: BotToken });
export type SetBotTokenCommand = z.infer<typeof SetBotTokenCommand>;

export const SuspendTenantCommand = z.object({ reason: z.string().trim().min(3).max(500) });
export type SuspendTenantCommand = z.infer<typeof SuspendTenantCommand>;

export const TenantModuleView = z.object({
  module: TenantModuleSchema,
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});
export const TenantDomainView = z.object({
  id: Uuid,
  host: z.string(),
  surface: TenantSurfaceSchema,
  isPrimary: z.boolean(),
  isManaged: z.boolean(),
  status: DomainStatusSchema,
  verifiedAt: IsoDateTime.nullable(),
});
export const TenantSecretView = z.object({
  kind: z.enum(['DATABASE_URL', 'BOT_TOKEN', 'BOT_WEBHOOK_SECRET']),
  present: z.boolean(),
  updatedAt: IsoDateTime.nullable(),
});

export const TenantSummaryView = z.object({
  id: Uuid,
  slug: z.string(),
  name: z.string(),
  displayName: z.string(),
  status: TenantStatusSchema,
  modules: z.array(TenantModuleSchema),
  schemaVersion: z.string().nullable(),
  panelHost: z.string().nullable(),
  lastJob: z
    .object({ id: Uuid, kind: ProvisioningKindSchema, status: JobStatusSchema, at: IsoDateTime })
    .nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TenantSummaryView = z.infer<typeof TenantSummaryView>;

export const TenantDetailView = TenantSummaryView.extend({
  defaultLocale: z.enum(LOCALES),
  timezone: z.string(),
  storagePrefix: z.string(),
  databaseName: z.string(),
  migratedAt: IsoDateTime.nullable(),
  suspendedAt: IsoDateTime.nullable(),
  suspendedReason: z.string().nullable(),
  accentColor: TenantAccentColor.nullable(),
  logoKey: z.string().nullable(),
  botUsername: z.string().nullable(),
  moduleRows: z.array(TenantModuleView),
  domains: z.array(TenantDomainView),
  secrets: z.array(TenantSecretView),
  /** The single onboarding link once issued; null until the invitation exists. */
  onboarding: z
    .object({ url: z.url(), expiresAt: IsoDateTime, usedAt: IsoDateTime.nullable() })
    .nullable(),
});
export type TenantDetailView = z.infer<typeof TenantDetailView>;

export const ProvisioningStepView = z.object({
  step: ProvisioningStepSchema,
  seq: z.number().int(),
  status: StepStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
});
export const ProvisioningJobView = z.object({
  id: Uuid,
  tenantId: Uuid,
  kind: ProvisioningKindSchema,
  status: JobStatusSchema,
  error: z.string().nullable(),
  createdAt: IsoDateTime,
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
  steps: z.array(ProvisioningStepView),
});
export type ProvisioningJobView = z.infer<typeof ProvisioningJobView>;

export const ControlAuditEntryView = z.object({
  id: z.number().int(),
  at: IsoDateTime,
  actorEmail: z.string().nullable(),
  action: z.string(),
  tenantId: Uuid.nullable(),
  objectType: z.string(),
  objectId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export type ControlAuditEntryView = z.infer<typeof ControlAuditEntryView>;

export const OperatorView = z.object({
  id: Uuid,
  email: z.string(),
  name: z.string(),
  role: OperatorRoleSchema,
  status: z.enum(['ACTIVE', 'DISABLED']),
  twoFactorEnabled: z.boolean(),
});
export type OperatorView = z.infer<typeof OperatorView>;

export const ModuleCatalogEntry = z.object({
  module: TenantModuleSchema,
  delivered: z.boolean(),
});
const DELIVERED = new Set<string>(DELIVERED_TENANT_MODULES);
export const MODULE_CATALOG: readonly z.infer<typeof ModuleCatalogEntry>[] = TENANT_MODULES.map(
  (module) => ({ module, delivered: DELIVERED.has(module) }),
);
