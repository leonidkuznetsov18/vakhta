import { z } from 'zod';
import { apiFetch } from '@/api';
import {
  CreateUnitShiftCommand,
  ShiftTemplateView,
  UpdateUnitShiftCommand,
  type ShiftTemplatesQuery,
} from '@vakhta/contracts';

const root = '/admin/schedules';

export async function readShiftTemplates(
  query: ShiftTemplatesQuery,
  signal?: AbortSignal,
): Promise<ShiftTemplateView[]> {
  const params = new URLSearchParams({ siteId: query.siteId });
  if (query.orgUnitId) params.set('orgUnitId', query.orgUnitId);
  if (query.includeRetired) params.set('includeRetired', 'true');
  return z
    .array(ShiftTemplateView)
    .parse(await apiFetch(`${root}/templates?${params}`, signal ? { signal } : {}));
}

export async function createUnitShift(
  orgUnitId: string,
  input: CreateUnitShiftCommand,
): Promise<ShiftTemplateView> {
  return ShiftTemplateView.parse(
    await apiFetch(`${root}/units/${orgUnitId}/templates`, {
      method: 'POST',
      body: JSON.stringify(CreateUnitShiftCommand.parse(input)),
    }),
  );
}

export async function updateUnitShift(
  id: string,
  input: UpdateUnitShiftCommand,
): Promise<ShiftTemplateView> {
  return ShiftTemplateView.parse(
    await apiFetch(`${root}/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(UpdateUnitShiftCommand.parse(input)),
    }),
  );
}

export async function deleteUnitShift(id: string, revision: number): Promise<void> {
  await apiFetch(`${root}/templates/${id}?revision=${revision}`, { method: 'DELETE' });
}
