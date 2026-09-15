import {
  EmployeeProfileView,
  UpdateEmployeeProfileCommand,
  AddCompensationEntryCommand,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';
import { apiRequest } from '@/shared/api';
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
    await apiRequest({
      url: `/admin/employees/${id}/avatar`,
      method: file ? 'PUT' : 'DELETE',
      headers: { 'if-match': version },
      ...(body ? { data: body } : {}),
    });
  },
};
export async function refreshProfiles(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.employees }),
    client.invalidateQueries({ queryKey: keys.org }),
  ]);
}
