import { z } from 'zod';
import { IsoDateTime } from './common.js';
import { TenantAccentColor } from './tenant.js';

export const BrandingErrorCode = {
  VERSION_CONFLICT: 'BRANDING_VERSION_CONFLICT',
  LOGO_INVALID: 'BRANDING_LOGO_INVALID',
  LOGO_TOO_LARGE: 'BRANDING_LOGO_TOO_LARGE',
  STORAGE_UNAVAILABLE: 'BRANDING_STORAGE_UNAVAILABLE',
} as const;
export const TENANT_LOGO_MAX_BYTES = 512 * 1024;
export const TenantBrandingView = z.object({
  displayName: z.string().trim().min(2).max(120),
  accentColor: TenantAccentColor.nullable(),
  logoUrl: z.url().nullable(),
  updatedAt: IsoDateTime,
});
export type TenantBrandingView = z.infer<typeof TenantBrandingView>;

/** Omitted logo preserves it; null removes it. Files are decoded and normalized by the server. */
export const UpdateTenantBrandingCommand = TenantBrandingView.pick({
  displayName: true,
  accentColor: true,
}).extend({
  expectedVersion: IsoDateTime,
  logo: z
    .string()
    .min(4)
    .max(Math.ceil(TENANT_LOGO_MAX_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .nullable()
    .optional(),
});
export type UpdateTenantBrandingCommand = z.infer<typeof UpdateTenantBrandingCommand>;
