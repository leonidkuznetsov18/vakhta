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

// ---- адміністрування: працівники, користувачі, довідники, термінали (ТЗ 9.1) ----

import type {
  ActivationCodeIssued,
  AssignPositionCommand,
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  CreateOrgUnitCommand,
  CreatePositionCommand,
  CreateSiteCommand,
  CreateTeamCommand,
  CreateWebUserCommand,
  CreateZoneCommand,
  EmployeePositionView,
  GrantRoleCommand,
  OrgUnitView,
  PositionView,
  RegisterTerminalCommand,
  RelinkTelegramCommand,
  RoleGrantView,
  SiteView,
  TeamView,
  TerminalRegistered,
  WebUserView,
  ZoneView,
} from '@vakhta/contracts';

export const adminEmployeesApi = {
  create: (cmd: CreateEmployeeCommand) => post<EmployeeView>('/admin/employees', cmd),
  changeStatus: (id: string, cmd: ChangeEmployeeStatusCommand) =>
    post<EmployeeView>(`/admin/employees/${id}/status`, cmd),
  issueCode: (id: string) => post<ActivationCodeIssued>(`/admin/employees/${id}/activation-codes`),
  relink: (id: string, cmd: RelinkTelegramCommand) =>
    post<{ employeeId: string; telegramUserId: number; linkedAt: string }>(
      `/admin/employees/${id}/telegram/relink`,
      cmd,
    ),
  positions: (id: string) => apiFetch<EmployeePositionView[]>(`/admin/employees/${id}/positions`),
  assignPosition: (id: string, cmd: AssignPositionCommand) =>
    post<EmployeePositionView>(`/admin/employees/${id}/positions`, cmd),
};

export const usersApi = {
  list: () => apiFetch<WebUserView[]>('/admin/users'),
  create: (cmd: CreateWebUserCommand) => post<WebUserView>('/admin/users', cmd),
  grant: (userId: string, cmd: GrantRoleCommand) =>
    post<RoleGrantView>(`/admin/users/${userId}/roles`, cmd),
  revoke: (userId: string, grantId: string) =>
    apiFetch<null>(`/admin/users/${userId}/roles/${grantId}`, { method: 'DELETE' }),
};

export const adminOrgApi = {
  createSite: (cmd: CreateSiteCommand) => post<SiteView>('/admin/org/sites', cmd),
  createOrgUnit: (cmd: CreateOrgUnitCommand) => post<OrgUnitView>('/admin/org/units', cmd),
  createTeam: (cmd: CreateTeamCommand) => post<TeamView>('/admin/org/teams', cmd),
  createPosition: (cmd: CreatePositionCommand) => post<PositionView>('/admin/org/positions', cmd),
  createZone: (cmd: CreateZoneCommand) => post<ZoneView>('/admin/org/zones', cmd),
  registerTerminal: (cmd: RegisterTerminalCommand) =>
    post<TerminalRegistered>('/admin/org/terminals', cmd),
};

// ---- оперативна зміна (ТЗ 9.2) ----

import type {
  ActiveShiftView,
  ActiveShiftsQuery,
  MasterStartShiftCommand,
  MasterTransitionCommand,
  ShiftDetailView,
  ShiftSessionView,
  TransitionResponse,
} from '@vakhta/contracts';

export const shiftsApi = {
  list: (q: ActiveShiftsQuery) =>
    apiFetch<ActiveShiftView[]>(
      `/admin/shifts${query({
        siteId: q.siteId,
        orgUnitId: q.orgUnitId,
        includeClosed: q.includeClosed ? 'true' : undefined,
      })}`,
    ),
  detail: (id: string) => apiFetch<ShiftDetailView>(`/admin/shifts/${id}`),
  transition: (id: string, cmd: MasterTransitionCommand) =>
    post<TransitionResponse>(`/admin/shifts/${id}/transition`, cmd),
  clarify: (id: string, reason: string) =>
    post<ShiftSessionView>(`/admin/shifts/${id}/clarify`, { reason }),
  start: (cmd: MasterStartShiftCommand) => post<TransitionResponse>('/admin/shifts/start', cmd),
  /** SSE: cookie сесії передається з withCredentials. */
  streamUrl: () => `${API_URL}/admin/shifts/stream`,
};
