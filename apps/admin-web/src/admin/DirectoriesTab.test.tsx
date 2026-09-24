import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { ShiftPeriod } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { stubFetch } from '@/test/stub-fetch';
import { clickRowAction, render } from '../test-utils.tsx';
import { DirectoriesTab } from './DirectoriesTab.tsx';

const all = messages(currentLocale());
const SITE = 'a0000000-0000-4000-8000-000000000001';
const CUPS = 'a0000000-0000-4000-8000-000000000002';
const STORE = 'a0000000-0000-4000-8000-000000000003';
const org: OrgSnapshot = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' }],
  orgUnits: [
    {
      id: CUPS,
      siteId: SITE,
      parentId: null,
      name: 'Цех Стаканов',
      masters: [],
      masterEmployeeId: null,
    },
    { id: STORE, siteId: SITE, parentId: null, name: 'Склад', masters: [], masterEmployeeId: null },
  ],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};
const morning = {
  id: 'b0000000-0000-4000-8000-000000000001',
  siteId: SITE,
  orgUnitId: CUPS,
  code: 'U_1',
  name: 'Ранкова',
  localStart: '05:00',
  localEnd: '13:00',
  period: ShiftPeriod.DAY,
  isActive: true,
  revision: 1,
  retiredAt: null,
  replacedById: null,
  usedCount: 0,
};

function mockApi() {
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  stubFetch(
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === '/admin/schedules/templates') return json([morning]);
      if (path === '/admin/employees/page') return json({ items: [], total: 0, nextCursor: null });
      return json([]);
    }),
  );
}

describe('DirectoriesTab units', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows each unit’s shifts and has no master button', async () => {
    mockApi();
    render(<DirectoriesTab org={org} />);
    const cups = (await screen.findByText('05:00–13:00')).closest('tr');
    const store = screen.getByText('Склад').closest('tr');
    if (!cups || !store) throw new Error('unit rows missing');
    expect(within(store).getByText(all.unitShifts.standardOnly)).toBeTruthy();
    expect(screen.queryByRole('button', { name: all.employeeProfile.setMaster })).toBeNull();
  });

  it('opens the unit Sheet from a row click', async () => {
    mockApi();
    render(<DirectoriesTab org={org} />);
    fireEvent.click(await screen.findByText('Цех Стаканов'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Цех Стаканов' })).toBeTruthy();
    expect(await within(sheet).findByText(all.unitShifts.sectionTitle)).toBeTruthy();
  });

  it('opens the unit Sheet from the row menu for keyboard users', async () => {
    mockApi();
    render(<DirectoriesTab org={org} />);
    await screen.findByText('Склад');
    // Rows keep their directory order: the second unit is Склад.
    await clickRowAction(all.unitShifts.openUnit, 1);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Склад' })).toBeTruthy();
  });
});
