import { z } from 'zod';
import {
  CommunicationAudience,
  CommunicationAttachment,
  CommunicationDetail,
  CommunicationHistory,
  type CommunicationAudienceQuery,
  type CreateCommunication,
} from '@vakhta/contracts';
import { apiFetch, API_URL, ApiError } from '@/api';
import { currentLocale } from '@/i18n';
export const communicationKey = (actor: string) => ['communications', actor] as const;
function search(query: CommunicationAudienceQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}
export const communicationApi = {
  async audience(query: CommunicationAudienceQuery, signal: AbortSignal) {
    return CommunicationAudience.parse(
      await apiFetch(`/admin/communications/audience?${search(query)}`, { signal }),
    );
  },
  async all(query: CommunicationAudienceQuery) {
    return CommunicationAudience.parse(
      await apiFetch(`/admin/communications/audience/ids?${search(query)}`),
    );
  },
  async create(command: CreateCommunication) {
    return z
      .object({ id: z.uuid() })
      .parse(
        await apiFetch('/admin/communications', { method: 'POST', body: JSON.stringify(command) }),
      );
  },
  async history(page: number, signal: AbortSignal) {
    return CommunicationHistory.parse(
      await apiFetch(`/admin/communications?page=${page}`, { signal }),
    );
  },
  async detail(id: string, signal: AbortSignal) {
    return CommunicationDetail.parse(await apiFetch(`/admin/communications/${id}`, { signal }));
  },
  close(id: string) {
    return apiFetch(`/admin/communications/${id}/close`, { method: 'POST' });
  },
  retry(id: string, partId: string) {
    return apiFetch(`/admin/communications/${id}/retry/${partId}`, { method: 'POST' });
  },
  async link(id: string) {
    return z
      .object({ url: z.url() })
      .parse(await apiFetch(`/admin/communications/attachments/${id}`));
  },
  discard(id: string) {
    return apiFetch(`/admin/communications/attachments/${id}`, { method: 'DELETE' });
  },
  async upload(file: File, signal: AbortSignal) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${API_URL}/admin/communications/attachments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-locale': currentLocale() },
      body,
      signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const parsed = z.object({ code: z.string().optional() }).safeParse(data);
      throw new ApiError(
        response.status,
        parsed.success ? (parsed.data.code ?? null) : null,
        'Upload failed',
      );
    }
    return CommunicationAttachment.parse(data);
  },
};
