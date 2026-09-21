import { LOCALES, TENANT_MODULES, TENANT_STATUSES, TENANT_SURFACES } from '@vakhta/domain';
import { z } from 'zod';
import { Uuid } from './common.js';

export const TenantModuleSchema = z.enum(TENANT_MODULES);
export const TenantStatusSchema = z.enum(TENANT_STATUSES);
export const TenantSurfaceSchema = z.enum(TENANT_SURFACES);
export const TenantAccentColor = z.string().regex(/^#[0-9a-f]{6}$/);

/** Public, unauthenticated configuration a panel or kiosk needs before sign-in. */
export const TenantPublicConfig = z.object({
  tenantId: Uuid,
  slug: z.string(),
  surface: TenantSurfaceSchema,
  apiUrl: z.url(),
  displayName: z.string(),
  logoUrl: z.url().nullable(),
  accentColor: TenantAccentColor.nullable(),
  defaultLocale: z.enum(LOCALES),
  modules: z.array(TenantModuleSchema),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export type TenantPublicConfig = z.infer<typeof TenantPublicConfig>;

/** Every queued job may name its tenant; the worker rejects unknown tenants in registry mode. */
export const TenantJobFields = { tenantId: Uuid.optional() } as const;
