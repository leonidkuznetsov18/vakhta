import { z } from 'zod';
import { ScheduleExportQuery } from '@vakhta/contracts';
import { ApiError, API_URL } from '@/api';
import { currentLocale } from '@/i18n';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const failure = z.object({ code: z.string().optional() });
const identity = z.uuid();

export async function requestScheduleExport(id: string, revision: number): Promise<Blob> {
  const versionId = identity.parse(id);
  const input = ScheduleExportQuery.parse({ expectedRevision: revision });
  const query = new URLSearchParams({ expectedRevision: String(input.expectedRevision) });
  const response = await fetch(`${API_URL}/admin/schedules/${versionId}/export?${query}`, {
    credentials: 'include',
    headers: { 'x-locale': currentLocale() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const parsed = response.headers.get('content-type')?.includes('application/json')
      ? failure.safeParse(await response.json())
      : null;
    throw new ApiError(
      response.status,
      parsed?.success ? (parsed.data.code ?? null) : null,
      'Schedule export failed',
    );
  }
  if (response.headers.get('content-type')?.split(';')[0]?.trim() !== MIME)
    throw new Error('Schedule export returned an unexpected file type');
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Schedule export returned an empty file');
  return blob;
}

export function downloadScheduleExport(blob: Blob, id: string, revision: number): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vakhta-schedule-${id}-r${revision}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
