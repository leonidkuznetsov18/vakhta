import { z } from 'zod';
import {
  ControlAuditEntryView,
  ModuleCatalogEntry,
  OperatorView,
  ProvisioningJobView,
  TenantDetailView,
  TenantBrandingView,
  type UpdateTenantBrandingCommand,
  TenantSettingsView,
  TenantSummaryView,
  type AddDomainCommand,
  type CreateTenantCommand,
  type SetBotTokenCommand,
  type SetModuleCommand,
  type UpdateTenantCommand,
  type UpdateTenantSettingsCommand,
} from '@vakhta/contracts';

function envString(name: string, fallback: string): string {
  const value: unknown = import.meta.env[name];
  return typeof value === 'string' && value ? value : fallback;
}
export const CONTROL_API_URL = envString('VITE_CONTROL_API_URL', 'http://localhost:3100');

export class ControlApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ControlApiError';
  }
}

export async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CONTROL_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const parsed = z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .safeParse(body);
    throw new ControlApiError(
      response.status,
      parsed.success ? (parsed.data.code ?? 'HTTP_ERROR') : 'HTTP_ERROR',
      parsed.success ? (parsed.data.message ?? response.statusText) : response.statusText,
    );
  }
  return schema.parse(body);
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

const Operator = OperatorView.pick({ id: true, email: true, name: true, role: true });
export type Operator = z.infer<typeof Operator>;
const SignInResult = z.object({ twoFactorRedirect: z.boolean().optional() });
const TotpEnable = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
const Ok = z.unknown();
const Url = z.object({ url: z.string() });

export const controlApi = {
  branding: (id: string) => request(TenantBrandingView, `/control/tenants/${id}/branding`),
  updateBranding: (id: string, command: UpdateTenantBrandingCommand) =>
    request(TenantBrandingView, `/control/tenants/${id}/branding`, {
      method: 'PUT',
      body: JSON.stringify(command),
    }),
  me: () => request(Operator, '/control/operators/me'),
  signIn: (email: string, password: string) =>
    request(SignInResult, '/auth/sign-in/email', json({ email, password })),
  verifyTotp: (code: string) =>
    request(Ok, '/auth/two-factor/verify-totp', json({ code, trustDevice: false })),
  enableTotp: (password: string) =>
    request(TotpEnable, '/auth/two-factor/enable', json({ password })),
  signOut: () => request(Ok, '/auth/sign-out', json({})),
  tenants: () => request(z.array(TenantSummaryView), '/control/tenants'),
  tenant: (id: string) => request(TenantDetailView, `/control/tenants/${id}`),
  createTenant: (cmd: CreateTenantCommand) =>
    request(TenantDetailView, '/control/tenants', json(cmd)),
  updateTenant: (id: string, cmd: UpdateTenantCommand) =>
    request(TenantDetailView, `/control/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(cmd),
    }),
  setModule: (id: string, module: string, cmd: SetModuleCommand) =>
    request(TenantDetailView, `/control/tenants/${id}/modules/${module}`, {
      method: 'PUT',
      body: JSON.stringify(cmd),
    }),
  addDomain: (id: string, cmd: AddDomainCommand) =>
    request(TenantDetailView, `/control/tenants/${id}/domains`, json(cmd)),
  setBotToken: (id: string, cmd: SetBotTokenCommand) =>
    request(TenantDetailView, `/control/tenants/${id}/bot-token`, {
      method: 'PUT',
      body: JSON.stringify(cmd),
    }),
  provision: (id: string) =>
    request(TenantDetailView, `/control/tenants/${id}/provision`, json({})),
  suspend: (id: string, reason: string) =>
    request(TenantDetailView, `/control/tenants/${id}/suspend`, json({ reason })),
  resume: (id: string) => request(TenantDetailView, `/control/tenants/${id}/resume`, json({})),
  reissueInvitation: (id: string) => request(Url, `/control/tenants/${id}/invitations`, json({})),
  jobs: (id: string) => request(z.array(ProvisioningJobView), `/control/tenants/${id}/jobs`),
  audit: (id: string) => request(z.array(ControlAuditEntryView), `/control/tenants/${id}/audit`),
  retryStep: (jobId: string, step: string) =>
    request(ProvisioningJobView, `/control/jobs/${jobId}/steps/${step}/retry`, json({})),
  skipStep: (jobId: string, step: string) =>
    request(ProvisioningJobView, `/control/jobs/${jobId}/steps/${step}/skip`, json({})),
  catalog: () => request(z.array(ModuleCatalogEntry), '/control/tenants/modules/catalog'),
  operators: () => request(z.array(OperatorView), '/control/operators'),
  settings: (id: string) => request(TenantSettingsView, `/control/tenants/${id}/settings`),
  updateSettings: (id: string, cmd: UpdateTenantSettingsCommand) =>
    request(TenantSettingsView, `/control/tenants/${id}/settings`, {
      method: 'PUT',
      body: JSON.stringify(cmd),
    }),
};

export const queryKeys = {
  branding: (id: string) => ['tenants', id, 'branding'] as const,
  me: ['me'] as const,
  tenants: ['tenants'] as const,
  tenant: (id: string) => ['tenants', id] as const,
  jobs: (id: string) => ['tenants', id, 'jobs'] as const,
  audit: (id: string) => ['tenants', id, 'audit'] as const,
  operators: ['operators'] as const,
  settings: (id: string) => ['tenants', id, 'settings'] as const,
};
