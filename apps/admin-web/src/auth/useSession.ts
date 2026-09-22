import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { ApiError, authApi } from '../api.ts';
import { keys } from '@/lib/query';

const TenantAccessError = { SUSPENDED: 'TENANT_SUSPENDED', NOT_FOUND: 'TENANT_NOT_FOUND' } as const;

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; offline: boolean }
  | { status: 'authenticated'; me: MeView };

/**
 * The panel's session. `GET /me` answers 401 without a cookie or before TOTP is confirmed, so a
 * failing read is not an error to show but the answer "nobody is signed in" — unless the request
 * never reached the server at all, which is the offline case the sign-in screen names.
 */
export function useSession() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error) {
        if (isAccessRevoked(error)) {
          await client.cancelQueries({ predicate: (entry) => entry.queryKey[0] !== keys.me[0] });
          client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== keys.me[0] });
          return null;
        }
        throw error;
      }
    },
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const state = sessionState(query);

  const refresh = () => client.invalidateQueries({ queryKey: keys.me });
  /**
   * Everything read under the old session goes with it: the next person is not this one.
   * `clear()` alone drops the cache without notifying mounted observers, so the shell would keep
   * the old `me` until a reload. Resetting `me` first re-reads it (now 401), which swaps the shell
   * to the sign-in screen and unmounts the pages; only then is the rest of the cache dropped.
   */
  const signOut = async () => {
    try {
      await authApi.signOut();
    } finally {
      await client.resetQueries({ queryKey: keys.me, exact: true });
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
    }
  };

  return { state, refresh, signOut };
}

function isAccessRevoked(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 ||
      error.code === TenantAccessError.SUSPENDED ||
      error.code === TenantAccessError.NOT_FOUND)
  );
}

function sessionState(query: {
  isPending: boolean;
  data: MeView | null | undefined;
  error: unknown;
}): SessionState {
  if (isAccessRevoked(query.error)) return { status: 'anonymous', offline: false };
  if (query.isPending) return { status: 'loading' };
  if (query.data === null) return { status: 'anonymous', offline: false };
  if (query.data) return { status: 'authenticated', me: query.data };
  return {
    status: 'anonymous',
    offline: !(query.error instanceof ApiError && query.error.kind === 'http'),
  };
}
