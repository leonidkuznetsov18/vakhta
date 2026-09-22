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
  canonicalUrl: z.url(),
  panelUrl: z.url().nullable(),
  kioskUrl: z.url().nullable(),
  displayName: z.string(),
  logoUrl: z.url().nullable(),
  accentColor: TenantAccentColor.nullable(),
  defaultLocale: z.enum(LOCALES),
  modules: z.array(TenantModuleSchema),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export type TenantPublicConfig = z.infer<typeof TenantPublicConfig>;

/** Error code of a route whose tenant module is switched off (spec AC-017, AC-018). */
export const TenantErrorCode = { MODULE_DISABLED: 'MODULE_DISABLED' } as const;

/** Every queued job may name its tenant; the worker rejects unknown tenants in registry mode. */
export const TenantJobFields = { tenantId: Uuid.optional() } as const;

export const OnboardingStatus = { READY: 'READY', USED: 'USED' } as const;
export const OnboardingRequest = z.object({
  host: z.string().min(1).max(253),
  token: z.string().min(32).max(128),
});
export const OnboardingPassword = z.string().min(12).max(128);
export const AcceptOnboarding = OnboardingRequest.extend({ password: OnboardingPassword });
export const OnboardingView = z.object({
  status: z.enum(OnboardingStatus),
  email: z.email(),
  displayName: z.string(),
  botUrl: z.url().nullable(),
  kioskUrl: z.url().nullable(),
});
export type OnboardingView = z.infer<typeof OnboardingView>;

/** The gateway replaces these headers before forwarding over verified HTTPS. */
export const TenantGateway = {
  HOST_HEADER: 'x-vakhta-tenant-host',
  KEY_HEADER: 'x-vakhta-gateway-key',
  PROBE_PATH: '/.well-known/vakhta-gateway',
  ORIGIN_PROBE_PATH: '/health/tenant-gateway',
  SERVICE: 'vakhta-tenant-gateway',
} as const;
export const TenantGatewayProbe = z.object({
  service: z.literal(TenantGateway.SERVICE),
  host: z.string().min(1),
});
