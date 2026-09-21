import { tenantConfig } from '@vakhta/tenant-client';
export { tenantConfig } from '@vakhta/tenant-client';

function envString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function panelApiUrl(): string {
  const runtime = tenantConfig();
  if (runtime) return runtime.apiUrl;
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return envString(import.meta.env['VITE_API_URL']) ?? 'http://localhost:3000';
  }
  throw new Error('Tenant configuration has not loaded');
}

export function kioskUrl(): string | null {
  const runtime = tenantConfig();
  if (runtime) return runtime.kioskUrl;
  if (import.meta.env.DEV) return envString(import.meta.env['VITE_KIOSK_URL']);
  return null;
}

export const CONTROL_API_URL =
  envString(import.meta.env['VITE_CONTROL_API_URL']) ?? 'https://control-api.vakhta.xyz';
