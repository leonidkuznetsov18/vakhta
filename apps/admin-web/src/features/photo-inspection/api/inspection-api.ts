import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { localActivity } from '@/shared/api/activity';
import { photoImageQuery } from '@/shared/lib/photo-image';
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

export const inspectionQueries = {
  detail: (id: InspectionIdentity) =>
    queryOptions({
      queryKey: inspectionKey(id),
      meta: localActivity,
      queryFn: ({ signal }) => inspectionApi.get(id, signal),
    }),
  link: (id: InspectionIdentity, sessionId: string) =>
    queryOptions({
      queryKey: [...inspectionKey(id), sessionId, 'link'] as const,
      meta: localActivity,
      queryFn: ({ signal }) => inspectionApi.link(id, signal),
      staleTime: (query) => {
        if (!query.state.data) return 0;
        return Math.max(
          0,
          Math.min(
            4 * 60_000,
            Date.parse(query.state.data.expiresAt) - query.state.dataUpdatedAt - 30_000,
          ),
        );
      },
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
    }),
};

export async function prepareInspectionPhoto(
  client: QueryClient,
  id: InspectionIdentity,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    client.fetchQuery({ ...inspectionQueries.detail(id), staleTime: 0 }),
    client
      .fetchQuery(inspectionQueries.link(id, sessionId))
      .then((link) => client.fetchQuery(photoImageQuery(link.url))),
  ]);
}
