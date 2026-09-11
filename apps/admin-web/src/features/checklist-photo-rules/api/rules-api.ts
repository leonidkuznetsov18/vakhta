import {
  ChecklistPhotoRulesView,
  CreatePhotoObject,
  PhotoObjectView,
  PhotoObjectsView,
  SaveChecklistPhotoRules,
  UpdatePhotoObject,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';
export const rulesKey = (definitionId: string) => ['checklist-photo-rules', definitionId];
export const photoObjectsKey = ['photo-objects'];
const path = (definitionId: string) => `/admin/checklists/${definitionId}/photo-rules`;
export const rulesApi = {
  async get(definitionId: string, signal: AbortSignal) {
    return ChecklistPhotoRulesView.parse(await apiFetch(path(definitionId), { signal }));
  },
  async save(definitionId: string, input: SaveChecklistPhotoRules) {
    return ChecklistPhotoRulesView.parse(
      await apiFetch(path(definitionId), {
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
  async updateObject(id: string, input: UpdatePhotoObject) {
    return PhotoObjectView.parse(
      await apiFetch(`/admin/photo-objects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(UpdatePhotoObject.parse(input)),
      }),
    );
  },
};
