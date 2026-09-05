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

// ---- довідники та графік (ТЗ 9.1 «График») ----

import type {
  AcknowledgementStatusView,
  AssignmentInput,
  CreateScheduleVersionCommand,
  EmployeeView,
  ListScheduleVersionsQuery,
  OrgSnapshot,
  ScheduleVersionDetail,
  ScheduleVersionView,
  ShiftTemplateView,
} from '@vakhta/contracts';

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const orgApi = {
  snapshot: () => apiFetch<OrgSnapshot>('/admin/org'),
};

export const employeesApi = {
  list: () => apiFetch<EmployeeView[]>('/admin/employees'),
};

export const schedulesApi = {
  templates: (siteId: string) =>
    apiFetch<ShiftTemplateView[]>(`/admin/schedules/templates${query({ siteId })}`),
  list: (q: ListScheduleVersionsQuery) =>
    apiFetch<ScheduleVersionView[]>(`/admin/schedules${query(q)}`),
  create: (cmd: CreateScheduleVersionCommand) => post<ScheduleVersionView>('/admin/schedules', cmd),
  detail: (id: string) => apiFetch<ScheduleVersionDetail>(`/admin/schedules/${id}`),
  putAssignments: (id: string, items: AssignmentInput[]) =>
    apiFetch<ScheduleVersionDetail>(`/admin/schedules/${id}/assignments`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  validate: (id: string) => post<ScheduleVersionDetail>(`/admin/schedules/${id}/validate`),
  submit: (id: string) => post<ScheduleVersionView>(`/admin/schedules/${id}/submit`),
  returnToDraft: (id: string, comment: string) =>
    post<ScheduleVersionView>(`/admin/schedules/${id}/return`, { comment }),
  publish: (id: string, changeReason?: string) =>
    post<ScheduleVersionView>(
      `/admin/schedules/${id}/publish`,
      changeReason ? { changeReason } : {},
    ),
  acknowledgements: (id: string) =>
    apiFetch<AcknowledgementStatusView[]>(`/admin/schedules/${id}/acknowledgements`),
};
