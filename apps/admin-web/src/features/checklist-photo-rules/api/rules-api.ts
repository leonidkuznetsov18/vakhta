import { ChecklistPhotoRulesView, SaveChecklistPhotoRules } from '@vakhta/contracts';
import { apiFetch } from '@/api';
export const rulesKey = (definitionId: string, zoneId: string) => [
  'checklist-photo-rules',
  definitionId,
  zoneId,
];
const path = (definitionId: string, zoneId: string) =>
  `/admin/checklists/${definitionId}/zones/${zoneId}/photo-rules`;
export const rulesApi = {
  async get(definitionId: string, zoneId: string, signal: AbortSignal) {
    return ChecklistPhotoRulesView.parse(await apiFetch(path(definitionId, zoneId), { signal }));
  },
  async save(definitionId: string, zoneId: string, input: SaveChecklistPhotoRules) {
    return ChecklistPhotoRulesView.parse(
      await apiFetch(path(definitionId, zoneId), {
        method: 'PUT',
        body: JSON.stringify(SaveChecklistPhotoRules.parse(input)),
      }),
    );
  },
};
