import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import axios from 'axios';
import { readEmployeePage, importEmployees } from './directory';
import { API_URL } from '@/shared/api';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
describe('generated employee transport with MSW', () => {
  it('sends coerced query parameters and validates the response', async () => {
    server.use(
      http.get(`${API_URL}/admin/employees/page`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('limit')).toBe('12');
        expect(request.credentials).toBe('include');
        return HttpResponse.json({ items: [], total: 0, nextCursor: null });
      }),
    );
    await expect(readEmployeePage({ limit: 12 })).resolves.toEqual({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });
  it('normalizes an import command and preserves the created/skipped response', async () => {
    server.use(
      http.post(`${API_URL}/admin/employees/import`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          items: [{ personnelNumber: '10', fullName: 'Employee Test' }],
        });
        return HttpResponse.json({ created: 1, skipped: [] }, { status: 201 });
      }),
    );
    await expect(
      importEmployees({ items: [{ personnelNumber: ' 10 ', fullName: ' Employee Test ' }] }),
    ).resolves.toEqual({ created: 1, skipped: [] });
  });
  it('rejects schema-invalid successful data', async () => {
    server.use(
      http.get(`${API_URL}/admin/employees/page`, () =>
        HttpResponse.json({ items: [], total: -1, nextCursor: null }),
      ),
    );
    await expect(readEmployeePage({ limit: 12 })).rejects.toThrow();
  });
  it('preserves domain errors from the generated operation', async () => {
    server.use(
      http.post(`${API_URL}/admin/employees/import`, () =>
        HttpResponse.json({ code: 'OUT_OF_SCOPE' }, { status: 403 }),
      ),
    );
    await expect(
      importEmployees({ items: [{ personnelNumber: '10', fullName: 'Employee Test' }] }),
    ).rejects.toMatchObject({ status: 403, code: 'OUT_OF_SCOPE' });
  });
  it('forwards cancellation through the generated client', async () => {
    const controller = new AbortController();
    server.use(
      http.get(`${API_URL}/admin/employees/page`, async () => {
        controller.abort();
        await delay(10);
        return HttpResponse.json({ items: [], total: 0, nextCursor: null });
      }),
    );
    await expect(readEmployeePage({ limit: 12 }, controller.signal)).rejects.toSatisfy(
      axios.isCancel,
    );
  });
});
