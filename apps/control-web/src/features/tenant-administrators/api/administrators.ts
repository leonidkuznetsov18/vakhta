import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { TenantAdministratorsView, type SetTenantAdministratorPassword } from '@vakhta/contracts';
import { request, queryKeys, controlApi } from '@/shared/api';

const path = (tenantId: string) => `/control/tenants/${tenantId}/administrators`;
const Ok = z.object({ ok: z.literal(true) });
export const administratorApi = {
  list: (tenantId: string, page: number, signal: AbortSignal) =>
    request(TenantAdministratorsView, `${path(tenantId)}?page=${page}`, { signal }),
  password: (target: {
    tenantId: string;
    userId: string;
    command: SetTenantAdministratorPassword;
  }) =>
    request(Ok, `${path(target.tenantId)}/${target.userId}/password`, {
      method: 'PUT',
      body: JSON.stringify(target.command),
    }),
  remove: (target: { tenantId: string; userId: string }) =>
    request(Ok, `${path(target.tenantId)}/${target.userId}`, { method: 'DELETE' }),
};
export const administratorQueries = {
  list: (tenantId: string, page: number) =>
    queryOptions({
      queryKey: [...queryKeys.tenant(tenantId), 'administrators', page] as const,
      queryFn: ({ signal }) => administratorApi.list(tenantId, page, signal),
    }),
  operator: () => queryOptions({ queryKey: queryKeys.me, queryFn: controlApi.me }),
};
