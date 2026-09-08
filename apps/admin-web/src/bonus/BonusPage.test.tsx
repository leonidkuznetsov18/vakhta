import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  employees: [
    {
      employeeId: 'e1',
      employeeName: 'Кузнецов Леонид',
      personnelNumber: '0001',
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
      shifts: 2,
      checklists: 2,
      approved: 2,
      remarks: 0,
      points: 2,
    },
  ],
};

function mockApi() {
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/bonus/points') return json(points);
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
});
