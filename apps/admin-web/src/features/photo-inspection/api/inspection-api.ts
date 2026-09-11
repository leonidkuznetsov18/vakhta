import {
  CreatePhotoObject,
  PhotoAnalysisLimits,
  PhotoInspectionView,
  PhotoObjectView,
  PhotoObjectsView,
  MediaLinkView,
  type SaveInspection,
  type SaveRunFeedback,
  type RequestInspectionAnalysis,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';
export interface InspectionIdentity {
  handoverId: string;
  mediaId: string;
  itemKey: string;
}
const path = (id: InspectionIdentity) =>
  `/admin/handovers/${id.handoverId}/photos/${id.mediaId}/${encodeURIComponent(id.itemKey)}/inspection`;
export const inspectionKey = (id: InspectionIdentity) => [
  'photo-inspection',
  id.handoverId,
  id.mediaId,
  id.itemKey,
];
export const photoObjectsKey = ['photo-objects'];
export const analysisLimitsKey = (id: InspectionIdentity) => [
  'photo-analysis-limits',
  id.handoverId,
  id.mediaId,
  id.itemKey,
];
export const inspectionApi = {
  async limits(id: InspectionIdentity, signal: AbortSignal) {
    return PhotoAnalysisLimits.parse(await apiFetch(`${path(id)}/limits`, { signal }));
  },
  async get(id: InspectionIdentity, signal: AbortSignal) {
    return PhotoInspectionView.parse(await apiFetch(path(id), { signal }));
  },
  async link(id: InspectionIdentity, signal: AbortSignal) {
    return MediaLinkView.parse(await apiFetch(`${path(id)}/link`, { signal }));
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
  async save(id: InspectionIdentity, data: SaveInspection) {
    return PhotoInspectionView.parse(
      await apiFetch(path(id), { method: 'POST', body: JSON.stringify(data) }),
    );
  },
  async analyze(id: InspectionIdentity, data: RequestInspectionAnalysis) {
    return PhotoInspectionView.parse(
      await apiFetch(`${path(id)}/analyze`, { method: 'POST', body: JSON.stringify(data) }),
    );
  },
  async rateRun(id: InspectionIdentity, runId: string, data: SaveRunFeedback) {
    return PhotoInspectionView.parse(
      await apiFetch(`${path(id)}/runs/${runId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  },
  export(id: InspectionIdentity) {
    return apiFetch<unknown>(`${path(id)}/export`);
  },
};
export function downloadJson(value: unknown, mediaId: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${mediaId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
