import { z } from 'zod';
import { Password } from './auth.js';
import { IsoDateTime, Uuid } from './common.js';

export const TenantAdministratorError = {
  NOT_FOUND: 'TENANT_ADMINISTRATOR_NOT_FOUND',
  LAST_ADMIN: 'TENANT_LAST_ADMINISTRATOR',
  CREDENTIAL_MISSING: 'TENANT_ADMINISTRATOR_CREDENTIAL_MISSING',
  UNCHANGED: 'TENANT_ADMINISTRATOR_PASSWORD_UNCHANGED',
} as const;
export const TenantAdministratorView = z.object({
  id: Uuid,
  name: z.string(),
  email: z.email(),
  twoFactorEnabled: z.boolean(),
  createdAt: IsoDateTime,
  canDelete: z.boolean(),
});
export type TenantAdministratorView = z.infer<typeof TenantAdministratorView>;
export const TenantAdministratorsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
export const TENANT_ADMINISTRATORS_PAGE_SIZE = 20;
export const TenantAdministratorsView = z.object({
  items: z.array(TenantAdministratorView),
  total: z.number().int().nonnegative(),
  databaseReady: z.boolean(),
});
export type TenantAdministratorsView = z.infer<typeof TenantAdministratorsView>;
export const SetTenantAdministratorPassword = z.object({ password: Password });
export type SetTenantAdministratorPassword = z.infer<typeof SetTenantAdministratorPassword>;
