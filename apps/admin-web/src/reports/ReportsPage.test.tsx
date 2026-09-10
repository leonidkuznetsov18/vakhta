import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../test-utils.tsx';
import { ReportsPage } from './ReportsPage.tsx';
import { AuditPage } from '../audit/AuditPage.tsx';
import type { LossesView } from '@vakhta/contracts';
import { useQueryClient } from '@tanstack/react-query';

function RefreshReport() {
  const client = useQueryClient();
  return (
    <button onClick={() => void client.invalidateQueries({ queryKey: ['reports', 'losses'] })}>
      Refresh report
    </button>
  );
}

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

function mockApi(
  metadata: Partial<Pick<LossesView, 'intervalsTotal' | 'intervalsTruncated'>> = {},
) {
  const calls: string[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/reports/losses') {
        const category = url.searchParams.get('category');
        return json({
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          totalMinutes: 9108,
          lostMinutes: 4276,
          explainedShare: 0.04,
          category,
          categoryLabel: category ? 'Передача' : null,
          bars: category
            ? [
                {
                  key: 'BREAKDOWN',
                  label: 'Поломка',
                  minutes: 90,
                  share: 0.6,
                  cumulative: 0.6,
                  intervals: 3,
                  employees: 2,
                },
              ]
            : [
                {
                  key: 'HANDOVER',
                  label: 'Передача',
                  minutes: 2170,
                  share: 0.51,
                  cumulative: 0.51,
                  intervals: 54,
                  employees: 6,
                },
                {
                  key: 'PREPARATION',
                  label: 'Подготовка',
                  minutes: 689,
                  share: 0.16,
                  cumulative: 0.67,
                  intervals: 33,
                  employees: 6,
                },
              ],
          intervals: category
            ? [
                {
                  id: 'a0000000-0000-4000-8000-000000000010',
                  businessDate: '2026-10-05',
                  employeeId: 'a0000000-0000-4000-8000-000000000011',
                  employeeName: 'Кузнецов Леонид',
                  orgUnitName: 'Цех',
                  zoneName: 'Линия 1',
                  category: 'HANDOVER',
                  categoryLabel: 'Передача',
                  reasonLabel: null,
                  comment: null,
                  startedAt: '2026-10-05T10:00:00.000Z',
                  endedAt: '2026-10-05T10:40:00.000Z',
                  minutes: 40,
                },
              ]
            : [],
          intervalsTotal: category ? 1 : 0,
          intervalsLimit: 500,
          intervalsTruncated: false,
          exportLimit: 20000,
          asOf: '2026-10-05T10:00:00.000Z',
          generatedAt: '2026-10-05T10:00:00.000Z',
          ...metadata,
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

  it('ranks the categories of lost time, then drills into one of them', async () => {
    // The period defaults to the current month; the calendar fields are covered by the domain tests.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T12:00:00Z') });
    const calls = mockApi();
    render(<ReportsPage />);

    // Level one arrives on its own: no "build" button to press, the period is the query.
    expect(await screen.findByText('Передача')).toBeTruthy();
    expect(screen.getByText('Подготовка')).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.startsWith('/admin/reports/losses?') &&
          c.includes('from=2026-10-01') &&
          c.includes('to=2026-10-31'),
      ),
    ).toBe(true);
    // How much of the loss carries a reason travels with the totals: 4% is a warning, not a detail.
    expect(screen.getByText('4%')).toBeTruthy();

    // Level two and three: choosing the category asks for it and shows its intervals.
    fireEvent.click(screen.getByText('Передача'));
    expect(await screen.findByText('Поломка')).toBeTruthy();
    expect(calls.some((c) => c.includes('category=HANDOVER'))).toBe(true);
    expect(screen.getByText('Кузнецов Леонид')).toBeTruthy();

    const csv = screen.getByRole('link', { name: 'CSV' });
    expect(csv.getAttribute('href')).toContain('/admin/reports/losses/export/csv?');
    expect(new URL(csv.getAttribute('href') ?? '').searchParams.get('asOf')).toBe(
      '2026-10-05T10:00:00.000Z',
    );
    expect(screen.getByRole('link', { name: 'XLSX' }).getAttribute('href')).toContain(
      '/export/xlsx',
    );
  });

  it('makes limited detail and an oversized export explicit before downloading', async () => {
    mockApi({ intervalsTotal: 20_001, intervalsTruncated: true });
    render(<ReportsPage />);
    expect(await screen.findByText(/Лимит экспорта — 20000/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CSV' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'XLSX' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('link', { name: 'CSV' })).toBeNull();
    fireEvent.click(screen.getByText('Передача'));
    expect(await screen.findByText('Показано 1 из 20001 интервалов.')).toBeTruthy();
    expect(screen.getByText(/Показаны только первые 500 интервалов/)).toBeTruthy();
  });

  it('keeps downloads disabled when the response cannot prove completeness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return new Response(
          JSON.stringify(url.pathname === '/admin/org' ? org : { intervalsTotal: 1 }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );
    render(<ReportsPage />);
    expect(await screen.findByText(/Не удалось проверить полноту отчёта/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CSV' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables downloads when a refetch invalidates previously complete report data', async () => {
    mockApi();
    render(
      <>
        <ReportsPage />
        <RefreshReport />
      </>,
    );
    expect(await screen.findByRole('link', { name: 'CSV' })).toBeTruthy();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ intervalsTotal: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }));
    expect(await screen.findByText(/Не удалось проверить полноту отчёта/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'CSV' })).toBeNull();
    expect(screen.getByRole('button', { name: 'CSV' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'XLSX' }).hasAttribute('disabled')).toBe(true);
  });

  it('audit shows actions with before/after and the event log with a link to the corrected event', async () => {
    mockApi();
    render(<AuditPage />);
    // The action shows its label with the raw code beside it.
    expect((await screen.findAllByText('Выгрузка отчёта')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('report.export')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Подробности' })[0]!);
    // The sheet lists the fields of the after-state; the raw JSON sits under a disclosure.
    const row = (await screen.findByText('format')).closest('tr')!;
    expect(row.textContent).toContain('csv');
    // The details sheet hides the page from assistive tech until it is closed.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Журнал событий' }));
    // The type appears in the row and as an option of the type filter.
    expect((await screen.findAllByText('SHIFT_CORRECTED')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/исправляет c0000000/)).toBeTruthy();
  });
});
