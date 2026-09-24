import type { EmployeeView, OrgSnapshot } from '@vakhta/contracts';

/**
 * Prototype data for the units workspace: one plant with the situations the design has to
 * answer — a healthy unit, a unit without a master, an inactive master, a master who works
 * elsewhere, a nested unit, an empty unit and people nobody has placed yet.
 */

const SITE_MAIN = 'a0000000-0000-4000-8000-000000000001';
const SITE_SOUTH = 'a0000000-0000-4000-8000-000000000011';

export const UNIT = {
  lids: 'a0000000-0000-4000-8000-000000000002',
  film: 'a0000000-0000-4000-8000-000000000006',
  print: 'a0000000-0000-4000-8000-000000000009',
  warehouse: 'a0000000-0000-4000-8000-000000000007',
  service: 'a0000000-0000-4000-8000-000000000008',
  lab: 'a0000000-0000-4000-8000-00000000000a',
  south: 'a0000000-0000-4000-8000-00000000000b',
} as const;

export const POSITION = {
  operator: 'b0000000-0000-4000-8000-000000000001',
  adjuster: 'b0000000-0000-4000-8000-000000000002',
  master: 'b0000000-0000-4000-8000-000000000003',
  storekeeper: 'b0000000-0000-4000-8000-000000000004',
  labAssistant: 'b0000000-0000-4000-8000-000000000005',
  electrician: 'b0000000-0000-4000-8000-000000000006',
} as const;

const TEAM = {
  lidsA: 'c0000000-0000-4000-8000-000000000001',
  lidsB: 'c0000000-0000-4000-8000-000000000002',
  filmA: 'c0000000-0000-4000-8000-000000000003',
} as const;

const employeeId = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const FIRST = [
  'Олена',
  'Андрій',
  'Марія',
  'Сергій',
  'Ірина',
  'Дмитро',
  'Наталія',
  'Олексій',
  'Тетяна',
  'Володимир',
  'Оксана',
  'Максим',
  'Юлія',
  'Роман',
  'Ганна',
  'Ігор',
];
const LAST = [
  'Ткач',
  'Коваленко',
  'Бондаренко',
  'Шевченко',
  'Мельник',
  'Кравченко',
  'Поліщук',
  'Лисенко',
  'Савченко',
  'Гриценко',
  'Марченко',
  'Руденко',
  'Павленко',
  'Мороз',
  'Гончар',
  'Кузьменко',
];

function personName(n: number) {
  // Distinct pairs for the first 256 seeds: the last name cycles, the first name shifts per cycle.
  return `${LAST[n % LAST.length]} ${FIRST[(n * 7 + Math.floor(n / LAST.length)) % FIRST.length]}`;
}

interface Seed {
  readonly n: number;
  readonly unit: string | null;
  readonly position: string | null;
  readonly team?: string | null;
  readonly status?: EmployeeView['status'];
  readonly name?: string;
}

function employee(seed: Seed): EmployeeView {
  const hasUnit = seed.unit !== null && seed.position !== null;
  return {
    id: employeeId(seed.n),
    personnelNumber: String(1000 + seed.n),
    fullName: seed.name ?? personName(seed.n),
    status: seed.status ?? 'ACTIVE',
    telegramLinked: seed.n % 3 !== 0,
    email: null,
    phone: null,
    telegramUsername: null,
    currentPosition: hasUnit
      ? { positionId: seed.position, orgUnitId: seed.unit, teamId: seed.team ?? null }
      : null,
    avatarVersion: null,
    createdAt: `2026-09-${String(1 + (seed.n % 20)).padStart(2, '0')}T06:00:00.000Z`,
  };
}

interface Block {
  readonly from: number;
  readonly count: number;
  readonly unit: string;
  readonly position: string;
  readonly team?: string | null;
}

function fill({ from, count, unit, position, team = null }: Block): Seed[] {
  return Array.from({ length: count }, (_, i) => ({ n: from + i, unit, position, team }));
}

/** Named people the scenarios talk about. */
export const PEOPLE = {
  tkach: employeeId(1),
  kovalenko: employeeId(2),
  bondarenko: employeeId(3),
  shevchenko: employeeId(4),
  melnyk: employeeId(60),
  kravchenko: employeeId(61),
} as const;

const seeds: Seed[] = [
  { n: 1, unit: UNIT.lids, position: POSITION.master, name: 'Ткач Олена' },
  { n: 2, unit: UNIT.film, position: POSITION.master, name: 'Коваленко Андрій' },
  {
    n: 3,
    unit: UNIT.warehouse,
    position: POSITION.storekeeper,
    name: 'Бондаренко Марія',
    status: 'TERMINATED',
  },
  { n: 4, unit: UNIT.lids, position: POSITION.master, name: 'Шевченко Сергій' },
  ...fill({ from: 10, count: 11, unit: UNIT.lids, position: POSITION.operator, team: TEAM.lidsA }),
  ...fill({ from: 21, count: 10, unit: UNIT.lids, position: POSITION.operator, team: TEAM.lidsB }),
  ...fill({ from: 31, count: 2, unit: UNIT.lids, position: POSITION.adjuster }),
  ...fill({ from: 33, count: 12, unit: UNIT.film, position: POSITION.operator, team: TEAM.filmA }),
  ...fill({ from: 45, count: 2, unit: UNIT.film, position: POSITION.adjuster }),
  ...fill({ from: 47, count: 5, unit: UNIT.print, position: POSITION.operator }),
  ...fill({ from: 52, count: 5, unit: UNIT.warehouse, position: POSITION.storekeeper }),
  ...fill({ from: 57, count: 3, unit: UNIT.service, position: POSITION.electrician }),
  { n: 60, unit: null, position: null, name: 'Мельник Ірина' },
  { n: 61, unit: null, position: null, name: 'Кравченко Дмитро' },
  ...fill({ from: 62, count: 5, unit: UNIT.south, position: POSITION.operator }),
  { n: 70, unit: null, position: null },
  { n: 71, unit: null, position: null },
  { n: 72, unit: null, position: null },
  { n: 73, unit: null, position: null },
  { n: 74, unit: null, position: null, status: 'BLOCKED' },
  { n: 75, unit: UNIT.film, position: POSITION.operator, team: TEAM.filmA, status: 'BLOCKED' },
];

export const roster: EmployeeView[] = seeds.map(employee);

export const org: Pick<OrgSnapshot, 'sites' | 'orgUnits' | 'positions' | 'teams' | 'zones'> = {
  sites: [
    { id: SITE_MAIN, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' },
    { id: SITE_SOUTH, code: 'south', name: 'Южная площадка', timezone: 'Europe/Kyiv' },
  ],
  orgUnits: [
    {
      id: UNIT.lids,
      siteId: SITE_MAIN,
      parentId: null,
      name: 'Цех Крышки',
      masters: [],
      masterEmployeeId: PEOPLE.tkach,
      designatedMaster: { id: PEOPLE.tkach, name: 'Ткач Олена', status: 'ACTIVE' },
    },
    {
      id: UNIT.film,
      siteId: SITE_MAIN,
      parentId: null,
      name: 'Цех Плёнка',
      masters: [],
      masterEmployeeId: null,
      designatedMaster: null,
    },
    {
      id: UNIT.print,
      siteId: SITE_MAIN,
      parentId: UNIT.film,
      name: 'Участок печати',
      masters: [],
      masterEmployeeId: PEOPLE.kovalenko,
      designatedMaster: { id: PEOPLE.kovalenko, name: 'Коваленко Андрій', status: 'ACTIVE' },
    },
    {
      id: UNIT.warehouse,
      siteId: SITE_MAIN,
      parentId: null,
      name: 'Склад',
      masters: [],
      masterEmployeeId: PEOPLE.bondarenko,
      designatedMaster: { id: PEOPLE.bondarenko, name: 'Бондаренко Марія', status: 'TERMINATED' },
    },
    {
      id: UNIT.service,
      siteId: SITE_MAIN,
      parentId: null,
      name: 'Сервисная бригада',
      masters: [],
      masterEmployeeId: PEOPLE.shevchenko,
      designatedMaster: { id: PEOPLE.shevchenko, name: 'Шевченко Сергій', status: 'ACTIVE' },
    },
    {
      id: UNIT.lab,
      siteId: SITE_MAIN,
      parentId: null,
      name: 'Лаборатория',
      masters: [],
      masterEmployeeId: PEOPLE.tkach,
      designatedMaster: { id: PEOPLE.tkach, name: 'Ткач Олена', status: 'ACTIVE' },
    },
    {
      id: UNIT.south,
      siteId: SITE_SOUTH,
      parentId: null,
      name: 'Цех Юг',
      masters: [],
      masterEmployeeId: null,
      designatedMaster: null,
    },
  ],
  positions: [
    { id: POSITION.operator, code: 'OPERATOR', name: 'Оператор' },
    { id: POSITION.adjuster, code: 'ADJUSTER', name: 'Наладчик' },
    { id: POSITION.master, code: 'MASTER', name: 'Мастер участка' },
    { id: POSITION.storekeeper, code: 'STOREKEEPER', name: 'Кладовщик' },
    { id: POSITION.labAssistant, code: 'LAB', name: 'Лаборант' },
    { id: POSITION.electrician, code: 'ELECTRICIAN', name: 'Электрик' },
  ],
  teams: [
    { id: TEAM.lidsA, orgUnitId: UNIT.lids, name: 'Бригада А' },
    { id: TEAM.lidsB, orgUnitId: UNIT.lids, name: 'Бригада Б' },
    { id: TEAM.filmA, orgUnitId: UNIT.film, name: 'Бригада А' },
  ],
  zones: [
    {
      id: 'd0000000-0000-4000-8000-000000000001',
      siteId: SITE_MAIN,
      orgUnitId: UNIT.lids,
      code: 'L1',
      name: 'Линия 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000002',
      siteId: SITE_MAIN,
      orgUnitId: UNIT.lids,
      code: 'L2',
      name: 'Линия 2',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000003',
      siteId: SITE_MAIN,
      orgUnitId: UNIT.film,
      code: 'F1',
      name: 'Экструдер 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
  ],
};

/** The "many people" variant: 240 more operators spread across the main units. */
export function largeRoster(): EmployeeView[] {
  const units = [UNIT.lids, UNIT.film, UNIT.print, UNIT.warehouse, UNIT.service];
  const extra = Array.from({ length: 240 }, (_, i) => ({
    n: 100 + i,
    unit: units[i % units.length] ?? UNIT.lids,
    position: i % 9 === 0 ? POSITION.adjuster : POSITION.operator,
  }));
  return [...roster, ...extra.map(employee)];
}
