import { TenantAdministratorError } from '@vakhta/contracts';
import { ControlApiError } from '@/shared/api';
import { t } from '@/shared/i18n';

export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function administratorError(error: unknown): string {
  if (error instanceof ControlApiError) {
    if (error.code === TenantAdministratorError.UNCHANGED) return t().administrators.unchanged;
    if (error.code === TenantAdministratorError.LAST_ADMIN) return t().administrators.lastAdmin;
  }
  return t().administrators.failed;
}
