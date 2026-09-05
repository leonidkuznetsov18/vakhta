import { useCallback, useEffect, useState } from 'react';
import type { MeView } from '@vakhta/contracts';
import { ApiError, authApi } from '../api.ts';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; offline: boolean }
  | { status: 'authenticated'; me: MeView };

/** Сесія панелі: GET /me відповідає 401 без cookie або до підтвердження TOTP. */
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setState({ status: 'authenticated', me });
    } catch (error) {
      const offline = !(error instanceof ApiError);
      setState({ status: 'anonymous', offline });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } finally {
      setState({ status: 'anonymous', offline: false });
    }
  }, []);

  return { state, refresh, signOut };
}
