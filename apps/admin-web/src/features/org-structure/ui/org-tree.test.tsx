import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { EmployeeView, OrgSnapshot } from '@vakhta/contracts';
import { render } from '../../../test-utils.tsx';
import { OrgTree } from './org-tree.tsx';

const SITE = 'a0000000-0000-4000-8000-00000000000a';
const PLANT = 'b0000000-0000-4000-8000-000000000001';
const PICKING = 'b0000000-0000-4000-8000-000000000002';
const OFFICE = 'b0000000-0000-4000-8000-000000000004';

const org: Pick<OrgSnapshot, 'sites' | 'orgUnits'> = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' }],
  orgUnits: [
    { id: PLANT, siteId: SITE, parentId: null, name: 'Цех Стаканов', masters: [] },
    {
      id: PICKING,
      siteId: SITE,
      parentId: PLANT,
      name: 'Цех выбирания',
      masters: [],
      designatedMaster: {
        id: 'e0000000-0000-4000-8000-000000000002',
        name: 'Дима Вихров',
        status: 'ACTIVE',
      },
    },
    { id: OFFICE, siteId: SITE, parentId: null, name: 'Офис', masters: [] },
  ],
};

function employee(id: string, fullName: string, orgUnitId: string): EmployeeView {
  return {
    id,
    personnelNumber: id.slice(-4),
    fullName,
    status: 'ACTIVE',
    telegramLinked: false,
    email: null,
    phone: null,
    telegramUsername: null,
    currentPosition: {
      positionId: 'c0000000-0000-4000-8000-000000000001',
      orgUnitId,
      teamId: null,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

const employees = [
  employee('e0000000-0000-4000-8000-000000000001', 'Яна Швец', PICKING),
  employee('e0000000-0000-4000-8000-000000000002', 'Дима Вихров', PICKING),
];

const loaded = {
  isPending: false,
  isFetching: false,
  isError: false,
  fetchStatus: 'idle' as const,
  error: null,
  refetch: () => Promise.resolve(),
};

describe('OrgTree', () => {
  afterEach(cleanup);

  it('nests units under the site and people under their unit, with the count line', () => {
    render(<OrgTree org={org} employees={employees} roster={loaded} onAssignMaster={vi.fn()} />);
    const site = screen.getByRole('button', { name: 'Основная площадка' });
    expect(site.getAttribute('aria-expanded')).toBe('true');
    const plant = screen.getByRole('button', { name: 'Цех Стаканов' }).closest('li');
    if (!plant) throw new Error('Unit branch not rendered');
    expect(within(plant).getByRole('button', { name: 'Цех выбирания' })).toBeTruthy();
    expect(within(plant).getByRole('link', { name: /Яна Швец/ })).toBeTruthy();
    expect(within(plant).getByRole('link', { name: /Дима Вихров/ })).toBeTruthy();
    const picking = within(plant).getByRole('button', { name: 'Цех выбирания' }).closest('li');
    if (!picking) throw new Error('Unit branch not rendered');
    expect(within(picking).getByText(/Мастер смены/).textContent).toContain('Дима Вихров');
    const office = screen.getByRole('button', { name: 'Офис' }).closest('li');
    if (!office) throw new Error('Unit branch not rendered');
    expect(within(office).getByText('Сотрудников нет')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Подразделения: 3 · Сотрудники: 2');
  });

  it('collapses a branch on demand and hands the unit to the master picker', () => {
    const onAssignMaster = vi.fn();
    render(
      <OrgTree org={org} employees={employees} roster={loaded} onAssignMaster={onAssignMaster} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Цех Стаканов' }));
    expect(screen.queryByRole('button', { name: 'Цех выбирания' })).toBeNull();
    const office = screen.getByRole('button', { name: 'Офис' }).closest('li');
    if (!office) throw new Error('Unit branch not rendered');
    fireEvent.click(within(office).getByRole('button', { name: 'Назначить мастера' }));
    expect(onAssignMaster).toHaveBeenCalledWith(org.orgUnits[2]);
  });

  it('narrows the tree to matching people and reports when nothing matches', () => {
    render(<OrgTree org={org} employees={employees} roster={loaded} onAssignMaster={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'швец' } });
    expect(screen.queryByRole('button', { name: 'Офис' })).toBeNull();
    expect(screen.getByRole('link', { name: /Яна Швец/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Дима Вихров/ })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'нет такого' } });
    expect(screen.getByText('Ничего не найдено.')).toBeTruthy();
  });

  it('shows the roster loading state instead of an empty tree', () => {
    render(
      <OrgTree
        org={org}
        employees={undefined}
        roster={{ ...loaded, isPending: true, isFetching: true, fetchStatus: 'fetching' }}
        onAssignMaster={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Загрузка');
    expect(screen.queryByRole('button', { name: 'Основная площадка' })).toBeNull();
  });
});
