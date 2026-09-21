import { TenancyMode, type TenancyMode as Mode } from '@vakhta/domain';
import { ENV_TENANT_ID } from '@vakhta/registry';

export function jobTenantId(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'tenantId' in data) {
    return typeof data.tenantId === 'string' ? data.tenantId : null;
  }
  return null;
}

/** Registry mode requires `tenantId`; env mode maps a legacy job without one to its only tenant. */
export function resolveJobTenantId(data: unknown, mode: Mode): string | null {
  const fallback = mode === TenancyMode.ENV ? ENV_TENANT_ID : null;
  return jobTenantId(data) ?? fallback;
}
