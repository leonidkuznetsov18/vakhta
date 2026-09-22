import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { authApi, ApiError } from '@/api';
import { keys } from '@/lib/query';
import { useSession } from './useSession';

const privateQuery = queryOptions({
  queryKey: keys.requests({ scope: 'mine' }),
  queryFn: async () => ['private records'],
});

const me: MeView = {
  id: 'session-user',
  name: 'Session User',
  email: 'session@example.com',
  image: null,
  roles: [],
  twoFactorEnabled: true,
  createdAt: '2026-09-12T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

it('shows the sign-in state right after signing out, without a reload', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(privateQuery.queryKey, ['from the old session']);
  let signedIn = true;
  vi.spyOn(authApi, 'me').mockImplementation(async () => {
    if (signedIn) return me;
    throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');
  });
  vi.spyOn(authApi, 'signOut').mockImplementation(async () => {
    signedIn = false;
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('authenticated'));

  await act(() => result.current.signOut());

  await waitFor(() =>
    expect(result.current.state).toEqual({ status: 'anonymous', offline: false }),
  );
  expect(client.getQueryData(privateQuery.queryKey)).toBeUndefined();
});

it.each([
  new ApiError(403, 'TENANT_SUSPENDED', 'Suspended'),
  new ApiError(404, 'TENANT_NOT_FOUND', 'Removed'),
  new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'),
])('removes cached tenant data and signs out when access is revoked: %s', async (error) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const read = vi.spyOn(authApi, 'me').mockResolvedValue(me);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  client.setQueryData(privateQuery.queryKey, ['private records']);
  read.mockRejectedValue(error);
  await act(() => result.current.refresh());
  await waitFor(() =>
    expect(result.current.state).toEqual({ status: 'anonymous', offline: false }),
  );
  expect(client.getQueryData(privateQuery.queryKey)).toBeUndefined();
  read.mockRejectedValue(new ApiError(0, null, 'Network unavailable'));
  await act(() => result.current.refresh());
  expect(result.current.state).toEqual({ status: 'anonymous', offline: false });
  unmount();
  client.clear();
});
