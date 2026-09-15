import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { authApi, ApiError } from '@/api';
import { useSession } from './useSession';

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
  client.setQueryData(['requests', 'stale'], ['from the old session']);
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
  expect(client.getQueryData(['requests', 'stale'])).toBeUndefined();
});
