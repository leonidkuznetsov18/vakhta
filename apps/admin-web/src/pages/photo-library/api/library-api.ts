import {
  MediaLinkView,
  PhotoLibraryView,
  type PhotoLibraryEntry,
  type PhotoLibraryQuery,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';
export const libraryApi = {
  async list(input: PhotoLibraryQuery, signal: AbortSignal) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) params.set(key, String(value));
    return PhotoLibraryView.parse(await apiFetch(`/admin/photo-inspections?${params}`, { signal }));
  },
  async link(row: PhotoLibraryEntry) {
    return MediaLinkView.parse(
      await apiFetch(
        `/admin/handovers/${row.handoverId}/photos/${row.photo.media.id}/${encodeURIComponent(row.photo.itemKey)}/inspection/link`,
      ),
    );
  },
};
