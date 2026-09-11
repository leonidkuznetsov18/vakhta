import {
  ChecklistPhotoRulesView,
  CreatePhotoObject,
  PhotoObjectView,
  PhotoObjectsView,
  SaveChecklistPhotoRules,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';
export const rulesKey = (definitionId: string, zoneId: string) => [
  'checklist-photo-rules',
  definitionId,
  zoneId,
];
export const photoObjectsKey = ['photo-objects'];
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
  async objects(signal: AbortSignal) {
    return PhotoObjectsView.parse(await apiFetch('/admin/photo-objects', { signal }));
  },
  async createObject(input: CreatePhotoObject) {
    return PhotoObjectView.parse(
      await apiFetch('/admin/photo-objects', {
        method: 'POST',
        body: JSON.stringify(CreatePhotoObject.parse(input)),
      }),
    );
  },
};
