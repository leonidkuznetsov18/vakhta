import type { MeView } from '@vakhta/contracts';

export const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Усі запити з cookie сесії; помилки зводяться до ApiError із кодом сервера. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const b = (body ?? {}) as { code?: string; message?: string };
    throw new ApiError(res.status, b.code ?? null, b.message ?? res.statusText);
  }
  return body as T;
}

export interface SignInResult {
  twoFactorRedirect?: boolean;
  user?: { id: string; email: string };
}

export const authApi = {
  signIn: (email: string, password: string) =>
    apiFetch<SignInResult>('/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  verifyTotp: (code: string) =>
    apiFetch<unknown>('/auth/two-factor/verify-totp', {
      method: 'POST',
      body: JSON.stringify({ code, trustDevice: false }),
    }),
  signOut: () => apiFetch<unknown>('/auth/sign-out', { method: 'POST', body: '{}' }),
  me: () => apiFetch<MeView>('/me'),
  enableTwoFactor: (password: string) =>
    apiFetch<{ totpURI: string; backupCodes: string[] }>('/auth/two-factor/enable', {
      method: 'POST',
      body: JSON.stringify({ password, method: 'totp' }),
    }),
};
