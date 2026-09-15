import { z } from 'zod';
import { ScheduleExportQuery } from '@vakhta/contracts';
import { apiBlob } from '@/shared/api';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const identity = z.uuid();

export async function requestScheduleExport(id: string, revision: number): Promise<Blob> {
  const versionId = identity.parse(id);
  const input = ScheduleExportQuery.parse({ expectedRevision: revision });
  const query = new URLSearchParams({ expectedRevision: String(input.expectedRevision) });
  const response = await apiBlob({
    url: `/admin/schedules/${versionId}/export?${query}`,
    timeout: 30_000,
  });
  if (
    String(response.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim() !== MIME
  )
    throw new Error('Schedule export returned an unexpected file type');
  const blob = response.data;
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
