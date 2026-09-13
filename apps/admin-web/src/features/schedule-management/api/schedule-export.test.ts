import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestScheduleExport } from './schedule-export';
const id = 'd0000000-0000-4000-8000-000000000001';
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
afterEach(() => vi.unstubAllGlobals());
describe('schedule XLSX boundary', () => {
  it('requests the exact revision with session credentials and returns the file', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('workbook', { headers: { 'content-type': mime } }));
    vi.stubGlobal('fetch', fetch);
    const result = await requestScheduleExport(id, 7);
    expect(result.size).toBe(8);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/admin/schedules/${id}/export?expectedRevision=7`),
      expect.objectContaining({
        credentials: 'include',
        headers: { 'x-locale': expect.any(String) },
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([403, 409, 422])(
    'preserves server failure %s without creating a file',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ code: 'EXPORT_FAILED' }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      await expect(requestScheduleExport(id, 1)).rejects.toMatchObject({
        status,
        code: 'EXPORT_FAILED',
      });
    },
  );
  it('rejects a successful HTML response and empty workbook', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('login', { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(new Response('', { headers: { 'content-type': mime } }));
    vi.stubGlobal('fetch', fetch);
    await expect(requestScheduleExport(id, 1)).rejects.toThrow('unexpected file type');
    await expect(requestScheduleExport(id, 1)).rejects.toThrow('empty file');
  });
  it('rejects invalid identity and missing positive revision before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(requestScheduleExport('../x', 1)).rejects.toThrow();
    await expect(requestScheduleExport(id, 0)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
