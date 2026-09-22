import { z } from 'zod';
import { WebRoleSchema } from './auth.js';
import { IsoDateTime, Uuid } from './common.js';

export const TenantUserKind = { WORKER: 'WORKER', PANEL: 'PANEL' } as const;
export const TenantUserGroup = { ALL: 'ALL', WORKER: 'WORKER' } as const;
export const TenantUserAvailability = {
  READY: 'READY',
  NOT_READY: 'NOT_READY',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export const TENANT_USERS_PAGE_SIZE = 20;
export const TENANT_COUNTS_BATCH_SIZE = 20;
export const TenantUserFilter = z.union([z.enum(TenantUserGroup), WebRoleSchema]);
export const TenantUsersQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(200).default(''),
  role: TenantUserFilter.default(TenantUserGroup.ALL),
});
export type TenantUsersQuery = z.infer<typeof TenantUsersQuery>;
export const TenantUserCountsQuery = z.object({
  ids: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(Uuid).min(1).max(TENANT_COUNTS_BATCH_SIZE)),
});
const Count = z.number().int().nonnegative();
export const TenantUserCounts = z.object({
  total: Count,
  workers: Count,
  panel: Count,
  roles: z.array(z.object({ role: WebRoleSchema, count: Count })),
  checkedAt: IsoDateTime,
});
export type TenantUserCounts = z.infer<typeof TenantUserCounts>;
export const TenantUserCountResult = z.discriminatedUnion('status', [
  z.object({
    tenantId: Uuid,
    status: z.literal(TenantUserAvailability.READY),
    counts: TenantUserCounts,
  }),
  z.object({
    tenantId: Uuid,
    status: z.enum([TenantUserAvailability.NOT_READY, TenantUserAvailability.UNAVAILABLE]),
  }),
]);
export type TenantUserCountResult = z.infer<typeof TenantUserCountResult>;
export const TenantUserView = z.object({
  id: Uuid,
  kind: z.enum(TenantUserKind),
  name: z.string(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  avatarId: Uuid.nullable(),
  personnelNumber: z.string().nullable(),
  roles: z.array(WebRoleSchema),
});
export type TenantUserView = z.infer<typeof TenantUserView>;
export const TenantUsersView = z.object({
  counts: TenantUserCounts,
  items: z.array(TenantUserView),
  total: Count,
});
export type TenantUsersView = z.infer<typeof TenantUsersView>;
