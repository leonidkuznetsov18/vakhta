import type {
  MeView,
  SetTerminalStatusCommand,
  TerminalPairingIssued,
  TerminalView,
  UpdateTerminalCommand,
} from '@vakhta/contracts';
import { currentLocale } from './i18n.tsx';

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
    headers: {
      // Fastify refuses an empty body under a JSON content type, so DELETE without a body sends none.
      ...(init.body !== undefined && init.body !== null
        ? { 'content-type': 'application/json' }
        : {}),
      'x-locale': currentLocale(),
      ...(init.headers ?? {}),
    },
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
  RemindResult,
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
  remove: (id: string) => apiFetch<null>(`/admin/schedules/${id}`, { method: 'DELETE' }),
  remind: (id: string) => post<RemindResult>(`/admin/schedules/${id}/remind`, {}),
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
  DirectoryKind,
  EmployeePositionView,
  GrantRoleCommand,
  ImportEmployeesCommand,
  ImportEmployeesResult,
  OrgUnitView,
  PositionView,
  RegisterTerminalCommand,
  RelinkTelegramCommand,
  RoleGrantView,
  SiteView,
  TeamView,
  TerminalRegistered,
  UpdateOrgUnitCommand,
  UpdatePositionCommand,
  UpdateSiteCommand,
  UpdateTeamCommand,
  UpdateZoneCommand,
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
  issueCodes: (employeeIds: string[]) =>
    post<ActivationCodeIssued[]>('/admin/employees/activation-codes', { employeeIds }),
  importMany: (cmd: ImportEmployeesCommand) =>
    post<ImportEmployeesResult>('/admin/employees/import', cmd),
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
  updateSite: (id: string, cmd: UpdateSiteCommand) =>
    apiFetch<SiteView>(`/admin/org/sites/${id}`, { method: 'PATCH', body: JSON.stringify(cmd) }),
  updateOrgUnit: (id: string, cmd: UpdateOrgUnitCommand) =>
    apiFetch<OrgUnitView>(`/admin/org/units/${id}`, { method: 'PATCH', body: JSON.stringify(cmd) }),
  updateTeam: (id: string, cmd: UpdateTeamCommand) =>
    apiFetch<TeamView>(`/admin/org/teams/${id}`, { method: 'PATCH', body: JSON.stringify(cmd) }),
  updatePosition: (id: string, cmd: UpdatePositionCommand) =>
    apiFetch<PositionView>(`/admin/org/positions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  updateZone: (id: string, cmd: UpdateZoneCommand) =>
    apiFetch<ZoneView>(`/admin/org/zones/${id}`, { method: 'PATCH', body: JSON.stringify(cmd) }),
  deleteDirectoryRow: (kind: DirectoryKind, id: string, reason: string) =>
    apiFetch<null>(`/admin/org/${kind}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  registerTerminal: (cmd: RegisterTerminalCommand) =>
    post<TerminalRegistered>('/admin/org/terminals', cmd),
  issuePairing: (terminalId: string) =>
    apiFetch<TerminalPairingIssued>(`/admin/org/terminals/${terminalId}/pairing`, {
      method: 'POST',
      body: '{}',
    }),
  updateTerminal: (terminalId: string, cmd: UpdateTerminalCommand) =>
    apiFetch<TerminalView>(`/admin/org/terminals/${terminalId}`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  deleteTerminal: (terminalId: string, reason: string) =>
    apiFetch<null>(`/admin/org/terminals/${terminalId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  setTerminalStatus: (terminalId: string, cmd: SetTerminalStatusCommand) =>
    apiFetch<TerminalView>(`/admin/org/terminals/${terminalId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
};

// ---- checklists of the zone handover (spec 5.6) ----

import type {
  ChecklistDefinitionView,
  SaveChecklistCommand,
  SetChecklistStatusCommand,
} from '@vakhta/contracts';

export const checklistsApi = {
  list: () => apiFetch<ChecklistDefinitionView[]>('/admin/org/checklists'),
  create: (cmd: SaveChecklistCommand) =>
    post<ChecklistDefinitionView>('/admin/org/checklists', cmd),
  update: (id: string, cmd: SaveChecklistCommand) =>
    apiFetch<ChecklistDefinitionView>(`/admin/org/checklists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  setStatus: (id: string, cmd: SetChecklistStatusCommand) =>
    apiFetch<ChecklistDefinitionView>(`/admin/org/checklists/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  delete: (id: string, reason: string) =>
    apiFetch<null>(`/admin/org/checklists/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  addPosition: (id: string, positionId: string) =>
    post<ChecklistDefinitionView>(`/admin/org/checklists/${id}/positions`, { positionId }),
  removePosition: (id: string, positionId: string) =>
    apiFetch<ChecklistDefinitionView>(`/admin/org/checklists/${id}/positions/${positionId}`, {
      method: 'DELETE',
    }),
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

// ---- простої та інциденти (ТЗ 9.1) ----

import type {
  IncidentDetailView,
  IncidentStatsView,
  IncidentTransitionCommand,
  IncidentView,
  IncidentsQuery,
} from '@vakhta/contracts';

export const incidentsApi = {
  list: (q: IncidentsQuery) =>
    apiFetch<IncidentView[]>(
      `/admin/incidents${query({ siteId: q.siteId, zoneId: q.zoneId, scope: q.scope })}`,
    ),
  detail: (id: string) => apiFetch<IncidentDetailView>(`/admin/incidents/${id}`),
  transition: (id: string, cmd: IncidentTransitionCommand) =>
    post<IncidentView>(`/admin/incidents/${id}/transition`, cmd),
  stats: (from: string, to: string, siteId?: string) =>
    apiFetch<IncidentStatsView>(`/admin/incidents/stats${query({ from, to, siteId })}`),
  streamUrl: () => `${API_URL}/admin/incidents/stream`,
};

// ---- чистота і передача (ТЗ 9.1) ----

import type {
  HandoverDetailView,
  HandoverListItemView,
  HandoverListQuery,
  HandoverView,
  MediaLinkView,
  ResolveHandoverCommand,
} from '@vakhta/contracts';

export const handoversApi = {
  list: (q: HandoverListQuery) =>
    apiFetch<HandoverListItemView[]>(
      `/admin/handovers${query({ siteId: q.siteId, zoneId: q.zoneId, scope: q.scope })}`,
    ),
  detail: (id: string) => apiFetch<HandoverDetailView>(`/admin/handovers/${id}`),
  resolve: (id: string, cmd: ResolveHandoverCommand) =>
    post<HandoverView>(`/admin/handovers/${id}/resolve`, cmd),
  mediaLink: (mediaId: string) => apiFetch<MediaLinkView>(`/admin/handovers/media/${mediaId}/link`),
  streamUrl: () => `${API_URL}/admin/handovers/stream`,
};

// ---- звернення, переробка, корекції (ТЗ 8, FR-COR) ----

import type {
  ApplyCorrectionCommand,
  CorrectionResultView,
  DecideOvertimeCommand,
  DecideRequestCommand,
  OvertimeView,
  RequestDetailView,
  RequestView,
  RequestsQuery,
} from '@vakhta/contracts';

export const requestsApi = {
  list: (q: RequestsQuery) =>
    apiFetch<RequestView[]>(
      `/admin/requests${query({ scope: q.scope, status: q.status, type: q.type, employeeId: q.employeeId })}`,
    ),
  detail: (id: string) => apiFetch<RequestDetailView>(`/admin/requests/${id}`),
  decide: (id: string, cmd: DecideRequestCommand) =>
    post<RequestView>(`/admin/requests/${id}/decide`, cmd),
  medicalLink: (id: string) => apiFetch<MediaLinkView>(`/admin/requests/${id}/medical/link`),
  overtime: (scope: 'pending' | 'all') =>
    apiFetch<OvertimeView[]>(`/admin/requests/overtime${query({ scope })}`),
  decideOvertime: (sessionId: string, cmd: DecideOvertimeCommand) =>
    post<OvertimeView>(`/admin/requests/overtime/${sessionId}/decide`, cmd),
  correct: (sessionId: string, cmd: ApplyCorrectionCommand) =>
    post<CorrectionResultView>(`/admin/requests/corrections/${sessionId}`, cmd),
  streamUrl: () => `${API_URL}/admin/requests/stream`,
};

// ---- бонус (ТЗ 7) ----

import type {
  AdjustScoreCommand,
  BonusPeriodView,
  BonusRuleVersionView,
  ReviewScoreCommand,
  SecondApprovalCommand,
  UpdateAdjustmentCommand,
  SetBaseAmountsCommand,
  ShiftScoreView,
} from '@vakhta/contracts';

export const bonusApi = {
  period: (siteId: string, month: string, employeeId?: string) =>
    apiFetch<BonusPeriodView>(`/admin/bonus/period${query({ siteId, month, employeeId })}`),
  rules: () => apiFetch<BonusRuleVersionView[]>('/admin/bonus/rules'),
  recompute: (sessionId: string) =>
    post<ShiftScoreView | null>(`/admin/bonus/scores/${sessionId}/recompute`),
  adjust: (scoreId: string, cmd: AdjustScoreCommand) =>
    post<ShiftScoreView>(`/admin/bonus/scores/${scoreId}/adjust`, cmd),
  second: (adjustmentId: string, cmd: SecondApprovalCommand) =>
    post<ShiftScoreView>(`/admin/bonus/adjustments/${adjustmentId}/second`, cmd),
  review: (scoreId: string, cmd: ReviewScoreCommand) =>
    post<ShiftScoreView>(`/admin/bonus/scores/${scoreId}/review`, cmd),
  updateAdjustment: (adjustmentId: string, cmd: UpdateAdjustmentCommand) =>
    apiFetch<ShiftScoreView>(`/admin/bonus/adjustments/${adjustmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  cancelAdjustment: (adjustmentId: string, reason: string) =>
    apiFetch<ShiftScoreView>(`/admin/bonus/adjustments/${adjustmentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  reopen: (periodId: string, comment: string) =>
    post<BonusPeriodView>(`/admin/bonus/period/${periodId}/reopen`, { comment }),
  close: (siteId: string, month: string, comment: string) =>
    post<BonusPeriodView>(`/admin/bonus/period/${siteId}/${month}/close`, { comment }),
  setBase: (periodId: string, cmd: SetBaseAmountsCommand) =>
    post<BonusPeriodView>(`/admin/bonus/period/${periodId}/base`, cmd),
  exportUrl: (periodId: string) => `${API_URL}/admin/bonus/period/${periodId}/export.csv`,
};

// ---- звіти й аудит (ТЗ 9.3, 13) ----

import type {
  AuditEntryView,
  AuditQuery,
  DomainEventView,
  EventsQuery,
  ReportKind,
  ReportQuery,
  ReportTableView,
} from '@vakhta/contracts';

export const reportsApi = {
  build: (kind: ReportKind, q: ReportQuery) =>
    apiFetch<ReportTableView>(
      `/admin/reports/${kind}${query({ siteId: q.siteId, orgUnitId: q.orgUnitId, from: q.from, to: q.to })}`,
    ),
  exportUrl: (kind: ReportKind, q: ReportQuery, format: 'csv' | 'xlsx') =>
    `${API_URL}/admin/reports/${kind}/export/${format}${query({ siteId: q.siteId, orgUnitId: q.orgUnitId, from: q.from, to: q.to })}`,
  audit: (q: AuditQuery) =>
    apiFetch<AuditEntryView[]>(
      `/admin/audit${query({ from: q.from, to: q.to, actorId: q.actorId, action: q.action, objectType: q.objectType, objectId: q.objectId, limit: q.limit ? String(q.limit) : undefined })}`,
    ),
  events: (q: EventsQuery) =>
    apiFetch<DomainEventView[]>(
      `/admin/audit/events${query({ from: q.from, to: q.to, employeeId: q.employeeId, shiftSessionId: q.shiftSessionId, type: q.type, limit: q.limit ? String(q.limit) : undefined })}`,
    ),
};
