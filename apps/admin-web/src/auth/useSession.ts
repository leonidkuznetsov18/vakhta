import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { ApiError, authApi } from '../api.ts';
import { keys } from '@/lib/query';

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
  const query = useQuery({ queryKey: keys.me, queryFn: () => authApi.me(), retry: false });
  const state: SessionState = query.isPending
    ? { status: 'loading' }
    : query.data
      ? { status: 'authenticated', me: query.data }
      : { status: 'anonymous', offline: !(query.error instanceof ApiError) };

  const refresh = () => client.invalidateQueries({ queryKey: keys.me });
  /** Everything read under the old session goes with it: the next person is not this one. */
  const signOut = async () => {
    try {
      await authApi.signOut();
    } finally {
      client.clear();
    }
  };

  return { state, refresh, signOut };
}
