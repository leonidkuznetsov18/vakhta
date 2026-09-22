import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { TenantUserCountResult, TenantUsersView, type TenantUsersQuery } from '@vakhta/contracts';
import { queryKeys, request } from '@/shared/api';

export const tenantUsersQueries = {
  counts: (ids: string[]) =>
    queryOptions({
      queryKey: ['tenant-user-counts', ...ids] as const,
      queryFn: ({ signal }) =>
        request(
          z.array(TenantUserCountResult),
          `/control/tenant-users/counts?ids=${ids.join(',')}`,
          { signal },
        ),
      enabled: ids.length > 0,
      refetchInterval: 60_000,
    }),
  directory: (tenantId: string, filter: TenantUsersQuery) =>
    queryOptions({
      queryKey: [
        ...queryKeys.tenant(tenantId),
        'users',
        filter.page,
        filter.role,
        filter.search,
      ] as const,
      queryFn: ({ signal }) =>
        request(
          TenantUsersView,
          `/control/tenant-users/${tenantId}?${new URLSearchParams({ page: String(filter.page), role: filter.role, search: filter.search })}`,
          { signal },
        ),
      refetchInterval: 60_000,
    }),
};
