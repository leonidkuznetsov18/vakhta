import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportsPage } from './ReportsPage.tsx';
import { AuditPage } from '../audit/AuditPage.tsx';

const org = {
  sites: [
    {
      id: 'a0000000-0000-4000-8000-000000000001',
      code: 'main',
      name: 'Основная',
      timezone: 'Europe/Kyiv',
    },
  ],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

function mockApi() {
  const calls: string[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/reports/hours') {
        return json({
          kind: 'hours',
          title: 'План/факт часов и отклонения',
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          columns: [
            { key: 'employee', label: 'Сотрудник', kind: 'text' },
            { key: 'shifts', label: 'Смен', kind: 'number' },
            { key: 'lateMinutes', label: 'Опоздания, мин', kind: 'minutes' },
          ],
          rows: [{ employee: 'Кузнецов Леонид', shifts: 12, lateMinutes: 35 }],
          totals: { employee: 'Итого', shifts: 12, lateMinutes: 35 },
          generatedAt: '2026-10-05T10:00:00.000Z',
          dataVersion: 'abc123def456',
        });
      }
      if (url.pathname === '/admin/audit')
        return json([
          {
            id: 'x1',
            at: '2026-10-05T10:00:00.000Z',
            actorType: 'WEB_USER',
            actorId: 'u1',
            action: 'report.export',
            objectType: 'report',
            objectId: 'hours',
            before: null,
            after: { format: 'csv' },
            reason: null,
          },
        ]);
      if (url.pathname === '/admin/audit/events')
        return json([
          {
            id: 'e1',
            type: 'SHIFT_CORRECTED',
            occurredAt: '2026-10-05T09:00:00.000Z',
            receivedAt: 'x',
            source: 'WEB',
            actorId: 'u1',
            actingRole: 'SHIFT_MASTER',
            employeeId: 'e',
            employeeName: 'Кузнецов Леонид',
            shiftSessionId: 's',
            reasonCode: 'FORGOT_BUTTON',
            comment: 'ok',
            correctsEventId: 'c0000000-0000-4000-8000-000000000001',
            payload: { x: 1 },
          },
        ]);
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('ReportsPage and AuditPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('builds a report for a period and shows the data version, totals and export links', async () => {
    // The period defaults to the current month; the calendar fields are covered by the domain tests.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T12:00:00Z') });
    const calls = mockApi();
    render(<ReportsPage />);
    expect(await screen.findByLabelText('С')).toBeTruthy();
    expect(screen.getByLabelText('По')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сформировать' }));
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    expect(screen.getByText(/abc123def456/)).toBeTruthy();
    expect(screen.getByText('Итого')).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.startsWith('/admin/reports/hours?') &&
          c.includes('from=2026-10-01') &&
          c.includes('to=2026-10-31'),
      ),
    ).toBe(true);
    const csv = screen.getByRole('link', { name: 'CSV' });
    expect(csv.getAttribute('href')).toContain('/admin/reports/hours/export/csv?');
    expect(screen.getByRole('link', { name: 'XLSX' }).getAttribute('href')).toContain(
      '/export/xlsx',
    );
  });

  it('audit shows actions with before/after and the event log with a link to the corrected event', async () => {
    mockApi();
    render(<AuditPage />);
    // The action shows its label with the raw code beside it.
    expect((await screen.findAllByText('Выгрузка отчёта')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('report.export')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'До/После' }));
    expect(await screen.findByText(/"format": "csv"/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Журнал событий' }));
    // The type appears in the row and as an option of the type filter.
    expect((await screen.findAllByText('SHIFT_CORRECTED')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/исправляет c0000000/)).toBeTruthy();
  });
});
