import { describe, expect, it } from 'vitest';
import type { EmployeeView, OrgUnitView, SiteView } from '@vakhta/contracts';
import { buildOrgTree, countOrgTree, filterOrgTree } from './unit-tree';

const SITE_A = 'a0000000-0000-4000-8000-00000000000a';
const SITE_B = 'a0000000-0000-4000-8000-00000000000b';
const PLANT = 'b0000000-0000-4000-8000-000000000001';
const PICKING = 'b0000000-0000-4000-8000-000000000002';
const LIDS = 'b0000000-0000-4000-8000-000000000003';
const OFFICE = 'b0000000-0000-4000-8000-000000000004';
const LOOP_A = 'b0000000-0000-4000-8000-000000000005';
const LOOP_B = 'b0000000-0000-4000-8000-000000000006';
const REMOTE = 'b0000000-0000-4000-8000-000000000007';

const sites: SiteView[] = [
  { id: SITE_B, code: 'second', name: 'Второй двор', timezone: 'Europe/Kyiv' },
  { id: SITE_A, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' },
];

function unit(input: {
  id: string;
  name: string;
  siteId: string;
  parentId: string | null;
}): OrgUnitView {
  return { ...input, masters: [] };
}

const orgUnits: OrgUnitView[] = [
  unit({ id: PICKING, name: 'Цех выбирания', siteId: SITE_A, parentId: PLANT }),
  unit({ id: PLANT, name: 'Цех Стаканов', siteId: SITE_A, parentId: null }),
  unit({ id: LIDS, name: 'Цех Крышки', siteId: SITE_A, parentId: PLANT }),
  unit({ id: OFFICE, name: 'Офис', siteId: SITE_A, parentId: null }),
  // A parent cycle and a parent on another site must not lose either unit.
  unit({ id: LOOP_A, name: 'Кольцо А', siteId: SITE_B, parentId: LOOP_B }),
  unit({ id: LOOP_B, name: 'Кольцо Б', siteId: SITE_B, parentId: LOOP_A }),
  unit({ id: REMOTE, name: 'Чужой родитель', siteId: SITE_B, parentId: PLANT }),
];

function employee({
  id,
  fullName,
  orgUnitId,
  status = 'ACTIVE',
}: {
  id: string;
  fullName: string;
  orgUnitId: string | null;
  status?: EmployeeView['status'];
}): EmployeeView {
  return {
    id,
    personnelNumber: id.slice(-4),
    fullName,
    status,
    telegramLinked: false,
    email: null,
    phone: null,
    telegramUsername: null,
    currentPosition: orgUnitId
      ? { positionId: 'c0000000-0000-4000-8000-000000000001', orgUnitId, teamId: null }
      : null,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

const employees: EmployeeView[] = [
  employee({
    id: 'e0000000-0000-4000-8000-000000000001',
    fullName: 'Яна Швец',
    orgUnitId: PICKING,
  }),
  employee({
    id: 'e0000000-0000-4000-8000-000000000002',
    fullName: 'Дима Вихров',
    orgUnitId: PICKING,
  }),
  employee({
    id: 'e0000000-0000-4000-8000-000000000003',
    fullName: 'Олег Бут',
    orgUnitId: PLANT,
    status: 'BLOCKED',
  }),
  employee({
    id: 'e0000000-0000-4000-8000-000000000004',
    fullName: 'Уволенный',
    orgUnitId: PLANT,
    status: 'TERMINATED',
  }),
  employee({
    id: 'e0000000-0000-4000-8000-000000000005',
    fullName: 'Без должности',
    orgUnitId: null,
  }),
  employee({
    id: 'e0000000-0000-4000-8000-000000000006',
    fullName: 'Кольцевой',
    orgUnitId: LOOP_A,
  }),
];

const tree = buildOrgTree({ org: { sites, orgUnits }, employees, locale: 'ru' });

describe('buildOrgTree', () => {
  it('nests units under their parent per site and sorts every level by name', () => {
    expect(tree.map((site) => site.site.name)).toEqual(['Второй двор', 'Основная площадка']);
    const main = tree[1];
    expect(main?.units.map((node) => node.unit.name)).toEqual(['Офис', 'Цех Стаканов']);
    const plant = main?.units[1];
    expect(plant?.children.map((node) => node.unit.name)).toEqual(['Цех выбирания', 'Цех Крышки']);
  });

  it('lists only people with a current position in the unit, sorted, without terminated ones', () => {
    const plant = tree[1]?.units[1];
    expect(plant?.employees.map((person) => person.fullName)).toEqual(['Олег Бут']);
    expect(plant?.employees[0]?.status).toBe('BLOCKED');
    const picking = plant?.children[0];
    expect(picking?.employees.map((person) => person.fullName)).toEqual([
      'Дима Вихров',
      'Яна Швец',
    ]);
  });

  it('counts the headcount of a unit including every unit below it', () => {
    const plant = tree[1]?.units[1];
    expect(plant?.headcount).toBe(3);
    expect(plant?.children[0]?.headcount).toBe(2);
    expect(plant?.children[1]?.headcount).toBe(0);
  });

  it('keeps units with a cyclic or foreign parent as roots of their own site', () => {
    const second = tree[0];
    const names = second?.units.map((node) => node.unit.name);
    expect(names).toEqual(['Чужой родитель', 'Кольцо А']);
    expect(second?.units[1]?.children.map((node) => node.unit.name)).toEqual(['Кольцо Б']);
    expect(second?.units[1]?.employees.map((person) => person.fullName)).toEqual(['Кольцевой']);
  });
});

describe('filterOrgTree', () => {
  it('returns the tree untouched for a blank query', () => {
    expect(filterOrgTree(tree, '  ')).toEqual(tree);
  });

  it('keeps a matching unit with everything below it', () => {
    const [main] = filterOrgTree(tree, 'стакан');
    expect(main?.site.name).toBe('Основная площадка');
    expect(main?.units.map((node) => node.unit.name)).toEqual(['Цех Стаканов']);
    expect(main?.units[0]?.children).toHaveLength(2);
    expect(main?.units[0]?.headcount).toBe(3);
  });

  it('keeps only the matching people and their ancestor units otherwise', () => {
    const result = filterOrgTree(tree, 'швец');
    expect(result).toHaveLength(1);
    const plant = result[0]?.units[0];
    expect(plant?.unit.name).toBe('Цех Стаканов');
    expect(plant?.employees).toEqual([]);
    expect(plant?.children.map((node) => node.unit.name)).toEqual(['Цех выбирания']);
    expect(plant?.children[0]?.employees.map((person) => person.fullName)).toEqual(['Яна Швец']);
    expect(plant?.headcount).toBe(1);
  });

  it('drops sites that have nothing left', () => {
    expect(filterOrgTree(tree, 'нет такого')).toEqual([]);
  });
});

it('countOrgTree totals the visible units and people', () => {
  expect(countOrgTree(tree)).toEqual({ units: 7, employees: 4 });
  expect(countOrgTree(filterOrgTree(tree, 'швец'))).toEqual({ units: 2, employees: 1 });
});
