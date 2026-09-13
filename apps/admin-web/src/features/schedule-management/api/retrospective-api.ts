import { ApiError, API_URL, apiFetch } from '@/api';
import { currentLocale } from '@/i18n';
import { RetrospectiveQuery, RetrospectiveView } from '@vakhta/contracts';

const root = '/admin/schedules/reports/retrospective';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Retrospective report (SC-41) and its formula-safe export (SC-43). */
export const retrospectiveApi = {
  async view(query: RetrospectiveQuery, signal: AbortSignal) {
    const params = new URLSearchParams(RetrospectiveQuery.parse(query));
    return RetrospectiveView.parse(await apiFetch(`${root}?${params}`, { signal }));
  },
  async download(query: RetrospectiveQuery): Promise<Blob> {
    const params = new URLSearchParams(RetrospectiveQuery.parse(query));
    const response = await fetch(`${API_URL}${root}/export?${params}`, {
      credentials: 'include',
      headers: { 'x-locale': currentLocale() },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ApiError(response.status, null, 'Retrospective export failed');
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== MIME)
      throw new Error('Retrospective export returned an unexpected file type');
    return response.blob();
  },
};

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
