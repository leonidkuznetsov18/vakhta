import {
  EmployeeProfileView,
  UpdateEmployeeProfileCommand,
  AddCompensationEntryCommand,
} from '@vakhta/contracts';
import { apiFetch, API_URL, ApiError } from '@/api';
import { currentLocale } from '@/i18n';
import { keys } from '@/lib/query';
import type { QueryClient } from '@tanstack/react-query';

export const profileKey = (id: string) => ['employees', id, 'profile'] as const;
export const profileApi = {
  async get(id: string, signal?: AbortSignal) {
    return EmployeeProfileView.parse(
      await apiFetch(`/admin/employees/${id}/profile`, signal ? { signal } : {}),
    );
  },
  save(id: string, command: UpdateEmployeeProfileCommand) {
    return apiFetch(`/admin/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(UpdateEmployeeProfileCommand.parse(command)),
    });
  },
  addCompensation(id: string, command: AddCompensationEntryCommand) {
    return apiFetch(`/admin/employees/${id}/compensation`, {
      method: 'POST',
      body: JSON.stringify(AddCompensationEntryCommand.parse(command)),
    });
  },
  async avatar(id: string, file: File | null, version: string) {
    const body = file ? new FormData() : undefined;
    if (file && body) body.append('avatar', file);
    const response = await fetch(`${API_URL}/admin/employees/${id}/avatar`, {
      method: file ? 'PUT' : 'DELETE',
      credentials: 'include',
      headers: { 'if-match': version, 'x-locale': currentLocale() },
      ...(body ? { body } : {}),
    });
    if (!response.ok) {
      const error: unknown = await response.json();
      throw new ApiError(
        response.status,
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : null,
        'Avatar request failed',
      );
    }
  },
};
export async function refreshProfiles(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.employees }),
    client.invalidateQueries({ queryKey: keys.org }),
  ]);
}
export const avatarUrl = (id: string, version: string | null | undefined) =>
  version ? `${API_URL}/admin/employees/${id}/avatar?v=${encodeURIComponent(version)}` : null;
