import { stubFetch } from '@/test/stub-fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../test-utils.tsx';
import { BonusPage } from './BonusPage.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' }],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

const points = {
  siteId: SITE,
  month: '2026-10',
  serverTime: '2026-10-05T10:00:00.000Z',
  units: [
    {
      orgUnitId: 'u1',
      orgUnitName: 'Цех фасовки',
      masters: ['Ткач Олена'],
      employees: 2,
      approved: 5,
      remarks: 1,
      points: 5,
    },
  ],
  employees: [
    {
      employeeId: 'e1',
      employeeName: 'Кузнецов Леонид',
      personnelNumber: '0001',
      orgUnitId: 'u1',
      orgUnitName: 'Цех фасовки',
      shifts: 4,
      checklists: 4,
      approved: 3,
      remarks: 1,
      points: 3,
    },
    {
      employeeId: 'e2',
      employeeName: 'Ткач Олена',
      personnelNumber: '0002',
      orgUnitId: 'u1',
      orgUnitName: 'Цех фасовки',
      shifts: 2,
      checklists: 2,
      approved: 2,
      remarks: 0,
      points: 2,
    },
  ],
};

const employeeReport = {
  month: '2026-10',
  serverTime: '2026-10-05T10:00:00.000Z',
  employee: points.employees[0],
  shifts: [
    {
      shiftSessionId: 's1',
      businessDate: '2026-10-03',
      shiftState: 'SHIFT_CLOSED',
      startedAt: '2026-10-03T05:00:00.000Z',
      endedAt: '2026-10-03T17:00:00.000Z',
      zoneName: 'Линия 1',
      handoverId: 'h1',
      handoverStatus: 'RESOLVED_ISSUE_CONFIRMED',
      checklistName: 'Смена',
      submittedAt: '2026-10-03T16:50:00.000Z',
      remarks: [{ itemKey: 'SURFACES', label: 'Поверхности', category: 'DIRT', text: 'Стол' }],
      review: null,
      resolution: {
        resolvedBy: 'master',
        decision: 'RESOLVED_ISSUE_CONFIRMED',
        reasonCode: null,
        comment: 'Стол грязный, фото подтверждает',
        at: '2026-10-03T18:00:00.000Z',
      },
      points: 0,
    },
    {
      shiftSessionId: 's2',
      businessDate: '2026-10-02',
      shiftState: 'SHIFT_CLOSED',
      startedAt: '2026-10-02T05:00:00.000Z',
      endedAt: '2026-10-02T17:00:00.000Z',
      zoneName: 'Линия 1',
      handoverId: 'h2',
      handoverStatus: 'ACCEPTED',
      checklistName: 'Смена',
      submittedAt: '2026-10-02T16:50:00.000Z',
      remarks: [],
      review: null,
      resolution: null,
      points: 1,
    },
  ],
  awards: [],
};

const employeeHistory = {
  groupBy: 'month',
  buckets: [
    { key: '2026-10', points: 3, checklistPoints: 3, awardPoints: 0, employees: 1, units: [] },
  ],
  entries: [],
  total: 0,
  serverTime: '2026-10-05T10:00:00.000Z',
};

function mockApi(finalizedAt: string | null = null) {
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  stubFetch(
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/bonus/points') return json({ ...points, finalizedAt });
      if (url.pathname === '/admin/bonus/employee') return json(employeeReport);
      if (url.pathname === '/admin/bonus/history') return json(employeeHistory);
      return json([]);
    }),
  );
}

describe('BonusPage (read-only points)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows points per employee and the totals, with no scoring controls', async () => {
    mockApi();
    render(<BonusPage />);

    // The leaderboard and table render both employees.
    await waitFor(() => expect(screen.getAllByText('Кузнецов Леонид').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Ткач Олена').length).toBeGreaterThan(0);

    // The remark-count pill (amber) is surfaced for the employee with a remark.
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    // Read-only: no period-close or point-adjust buttons.
    expect(
      screen.queryByRole('button', { name: /Close period|Закрыть период|Add points|Начислить/i }),
    ).toBeNull();
  });
  it('opens the employee report under the row, with the shifts and their remarks', async () => {
    mockApi();
    render(<BonusPage />);
    const [name] = await screen.findAllByText('Кузнецов Леонид');
    if (!name) throw new Error('Employee row not rendered');
    fireEvent.click(name);

    // The report is inline under the row and the address carries the employee for linking.
    expect(await screen.findByTestId('bonus-employee-report')).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/bonus/e1'));
    // One line per shift: the remark preview of the confirmed remark and the earned point.
    expect(await screen.findByText('Стол грязный, фото подтверждает')).toBeTruthy();
    expect(screen.getAllByText(/Remark|Замечание|Зауваження/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Approved|Одобрен|Схвалено/).length).toBeGreaterThan(0);

    // Clicking the same row again closes the report and clears the address.
    fireEvent.click(name);
    await waitFor(() => expect(screen.queryByTestId('bonus-employee-report')).toBeNull());
    await waitFor(() => expect(window.location.hash).toBe('#/bonus'));
  });

  it('distinguishes final nominations even when the month has no winners', async () => {
    mockApi('2026-10-02T06:00:00.000Z');
    render(<BonusPage />);
    expect(
      await screen.findByText(/Окончательные номинации|Final nominations|Остаточні номінації/),
    ).toBeTruthy();
  });

  it('labels live nominations as preliminary', async () => {
    mockApi();
    render(<BonusPage />);
    expect(
      await screen.findByText(
        /Предварительные номинации|Preliminary nominations|Попередні номінації/,
      ),
    ).toBeTruthy();
  });
});
