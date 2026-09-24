import type { EmployeeView } from '@vakhta/contracts';
import {
  OrgUnitKind,
  ResponsibleSlot,
  type HistoryEntry,
  type OrgNodeView,
  type ResponsibleAssignment,
} from '../../model/org-node';
import type { WorkspaceOrg } from '../../model/workspace';

/**
 * Prototype data for the structure section (spec 014): two sites, divisions → shops → sections,
 * three responsible slots per node and the situations the design has to answer — a healthy shop,
 * a shop without a head, a terminated head, a head who works elsewhere, an empty shop, an archived
 * node and people nobody has placed yet.
 */

const SITE_MAIN = 'a0000000-0000-4000-8000-000000000001';
const SITE_SOUTH = 'a0000000-0000-4000-8000-000000000011';

export const UNIT = {
  production: 'a0000000-0000-4000-8000-000000000020',
  lids: 'a0000000-0000-4000-8000-000000000002',
  lidsLine1: 'a0000000-0000-4000-8000-000000000021',
  lidsLine2: 'a0000000-0000-4000-8000-000000000022',
  film: 'a0000000-0000-4000-8000-000000000006',
  print: 'a0000000-0000-4000-8000-000000000009',
  lab: 'a0000000-0000-4000-8000-00000000000a',
  service: 'a0000000-0000-4000-8000-000000000023',
  warehouse: 'a0000000-0000-4000-8000-000000000007',
  repair: 'a0000000-0000-4000-8000-000000000008',
  oldPaint: 'a0000000-0000-4000-8000-000000000024',
  southProduction: 'a0000000-0000-4000-8000-000000000025',
  south: 'a0000000-0000-4000-8000-00000000000b',
} as const;

export const POSITION = {
  operator: 'b0000000-0000-4000-8000-000000000001',
  adjuster: 'b0000000-0000-4000-8000-000000000002',
  master: 'b0000000-0000-4000-8000-000000000003',
  storekeeper: 'b0000000-0000-4000-8000-000000000004',
  labAssistant: 'b0000000-0000-4000-8000-000000000005',
  electrician: 'b0000000-0000-4000-8000-000000000006',
  head: 'b0000000-0000-4000-8000-000000000007',
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
  petrenko: employeeId(5),
  sydorenko: employeeId(6),
  lysenko: employeeId(7),
  honchar: employeeId(8),
  melnyk: employeeId(60),
  kravchenko: employeeId(61),
} as const;

const seeds: Seed[] = [
  { n: 5, unit: UNIT.production, position: POSITION.head, name: 'Петренко Сергій' },
  { n: 1, unit: UNIT.lids, position: POSITION.head, name: 'Ткач Олена' },
  { n: 6, unit: UNIT.lids, position: POSITION.master, name: 'Сидоренко Дмитро' },
  { n: 7, unit: UNIT.lids, position: POSITION.master, name: 'Лисенко Ірина' },
  { n: 2, unit: UNIT.film, position: POSITION.master, name: 'Коваленко Андрій' },
  { n: 8, unit: UNIT.print, position: POSITION.master, name: 'Гончар Оксана' },
  {
    n: 3,
    unit: UNIT.warehouse,
    position: POSITION.storekeeper,
    name: 'Бондаренко Марія',
    status: 'TERMINATED',
  },
  { n: 4, unit: UNIT.repair, position: POSITION.electrician, name: 'Шевченко Сергій' },
  ...fill({
    from: 10,
    count: 11,
    unit: UNIT.lidsLine1,
    position: POSITION.operator,
    team: TEAM.lidsA,
  }),
  ...fill({
    from: 21,
    count: 10,
    unit: UNIT.lidsLine2,
    position: POSITION.operator,
    team: TEAM.lidsB,
  }),
  ...fill({ from: 31, count: 2, unit: UNIT.lids, position: POSITION.adjuster }),
  ...fill({ from: 33, count: 12, unit: UNIT.film, position: POSITION.operator, team: TEAM.filmA }),
  ...fill({ from: 45, count: 2, unit: UNIT.film, position: POSITION.adjuster }),
  ...fill({ from: 47, count: 5, unit: UNIT.print, position: POSITION.operator }),
  ...fill({ from: 52, count: 5, unit: UNIT.warehouse, position: POSITION.storekeeper }),
  ...fill({ from: 57, count: 3, unit: UNIT.repair, position: POSITION.electrician }),
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

interface NodeSeed {
  readonly id: string;
  readonly siteId: string;
  readonly parentId: string | null;
  readonly kind: OrgUnitKind;
  readonly name: string;
  readonly validFrom?: string;
  readonly archivedAt?: string | null;
}

function node(seed: NodeSeed): OrgNodeView {
  return {
    id: seed.id,
    siteId: seed.siteId,
    parentId: seed.parentId,
    name: seed.name,
    kind: seed.kind,
    masters: [],
    masterEmployeeId: null,
    designatedMaster: null,
    validFrom: seed.validFrom ?? '2026-01-01',
    archivedAt: seed.archivedAt ?? null,
  };
}

const nodeSeeds: NodeSeed[] = [
  {
    id: UNIT.production,
    siteId: SITE_MAIN,
    parentId: null,
    kind: OrgUnitKind.DIVISION,
    name: 'Производство',
  },
  {
    id: UNIT.lids,
    siteId: SITE_MAIN,
    parentId: UNIT.production,
    kind: OrgUnitKind.SHOP,
    name: 'Цех Крышки',
  },
  {
    id: UNIT.lidsLine1,
    siteId: SITE_MAIN,
    parentId: UNIT.lids,
    kind: OrgUnitKind.SECTION,
    name: 'Линия 1',
  },
  {
    id: UNIT.lidsLine2,
    siteId: SITE_MAIN,
    parentId: UNIT.lids,
    kind: OrgUnitKind.SECTION,
    name: 'Линия 2',
  },
  {
    id: UNIT.film,
    siteId: SITE_MAIN,
    parentId: UNIT.production,
    kind: OrgUnitKind.SHOP,
    name: 'Цех Плёнка',
  },
  {
    id: UNIT.print,
    siteId: SITE_MAIN,
    parentId: UNIT.film,
    kind: OrgUnitKind.SECTION,
    name: 'Участок печати',
    validFrom: '2026-09-01',
  },
  {
    id: UNIT.lab,
    siteId: SITE_MAIN,
    parentId: UNIT.production,
    kind: OrgUnitKind.SHOP,
    name: 'Лаборатория',
  },
  {
    id: UNIT.service,
    siteId: SITE_MAIN,
    parentId: null,
    kind: OrgUnitKind.DIVISION,
    name: 'Сервис и логистика',
  },
  {
    id: UNIT.warehouse,
    siteId: SITE_MAIN,
    parentId: UNIT.service,
    kind: OrgUnitKind.SHOP,
    name: 'Склад',
  },
  {
    id: UNIT.repair,
    siteId: SITE_MAIN,
    parentId: UNIT.service,
    kind: OrgUnitKind.SHOP,
    name: 'Ремонтная служба',
  },
  {
    id: UNIT.oldPaint,
    siteId: SITE_MAIN,
    parentId: UNIT.production,
    kind: OrgUnitKind.SHOP,
    name: 'Покраска',
    archivedAt: '2026-06-30T21:00:00.000Z',
  },
  {
    id: UNIT.southProduction,
    siteId: SITE_SOUTH,
    parentId: null,
    kind: OrgUnitKind.DIVISION,
    name: 'Производство Юг',
  },
  {
    id: UNIT.south,
    siteId: SITE_SOUTH,
    parentId: UNIT.southProduction,
    kind: OrgUnitKind.SHOP,
    name: 'Цех Юг',
  },
];

const responsibles: ResponsibleAssignment[] = [
  {
    unitId: UNIT.production,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.petrenko,
    validFrom: '2026-01-01',
  },
  {
    unitId: UNIT.lids,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.tkach,
    validFrom: '2026-01-01',
  },
  {
    unitId: UNIT.lids,
    slot: ResponsibleSlot.SHIFT_MASTER_DAY,
    employeeId: PEOPLE.sydorenko,
    validFrom: '2026-03-01',
  },
  {
    unitId: UNIT.lids,
    slot: ResponsibleSlot.SHIFT_MASTER_NIGHT,
    employeeId: PEOPLE.lysenko,
    validFrom: '2026-03-01',
  },
  {
    unitId: UNIT.lidsLine1,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.sydorenko,
    validFrom: '2026-03-01',
  },
  {
    unitId: UNIT.lidsLine2,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.lysenko,
    validFrom: '2026-03-01',
  },
  {
    unitId: UNIT.film,
    slot: ResponsibleSlot.SHIFT_MASTER_DAY,
    employeeId: PEOPLE.kovalenko,
    validFrom: '2026-02-15',
  },
  {
    unitId: UNIT.print,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.honchar,
    validFrom: '2026-09-01',
  },
  {
    unitId: UNIT.warehouse,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.bondarenko,
    validFrom: '2026-01-01',
  },
  {
    unitId: UNIT.repair,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.shevchenko,
    validFrom: '2026-01-01',
  },
  {
    unitId: UNIT.lab,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.tkach,
    validFrom: '2026-05-01',
  },
  {
    unitId: UNIT.service,
    slot: ResponsibleSlot.HEAD,
    employeeId: PEOPLE.shevchenko,
    validFrom: '2026-01-01',
  },
];

const history: HistoryEntry[] = [
  {
    id: 'h1',
    unitId: UNIT.film,
    at: '2026-09-01',
    author: 'Мастер цеха',
    text: 'Создан участок «Участок печати» внутри цеха',
  },
  {
    id: 'h2',
    unitId: UNIT.film,
    at: '2026-02-15',
    author: 'Мастер цеха',
    text: 'Мастер дневной смены: Коваленко Андрій',
  },
  {
    id: 'h3',
    unitId: UNIT.film,
    at: '2026-01-01',
    author: 'Система',
    text: 'Цех перенесён из площадки в подразделение «Производство» (миграция структуры)',
  },
  {
    id: 'h4',
    unitId: UNIT.lids,
    at: '2026-03-01',
    author: 'Мастер цеха',
    text: 'Мастера смен: день — Сидоренко Дмитро, ночь — Лисенко Ірина',
  },
  {
    id: 'h5',
    unitId: UNIT.lids,
    at: '2026-01-01',
    author: 'Система',
    text: 'Руководитель: Ткач Олена',
  },
  {
    id: 'h6',
    unitId: UNIT.warehouse,
    at: '2026-01-01',
    author: 'Система',
    text: 'Руководитель: Бондаренко Марія',
  },
];

export const org: WorkspaceOrg = {
  sites: [
    { id: SITE_MAIN, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' },
    { id: SITE_SOUTH, code: 'south', name: 'Южная площадка', timezone: 'Europe/Kyiv' },
  ],
  orgUnits: nodeSeeds.map(node),
  responsibles,
  history,
  positions: [
    { id: POSITION.operator, code: 'OPERATOR', name: 'Оператор' },
    { id: POSITION.adjuster, code: 'ADJUSTER', name: 'Наладчик' },
    { id: POSITION.master, code: 'MASTER', name: 'Мастер участка' },
    { id: POSITION.storekeeper, code: 'STOREKEEPER', name: 'Кладовщик' },
    { id: POSITION.labAssistant, code: 'LAB', name: 'Лаборант' },
    { id: POSITION.electrician, code: 'ELECTRICIAN', name: 'Электрик' },
    { id: POSITION.head, code: 'HEAD', name: 'Начальник цеха' },
  ],
  teams: [
    { id: TEAM.lidsA, orgUnitId: UNIT.lidsLine1, name: 'Бригада А' },
    { id: TEAM.lidsB, orgUnitId: UNIT.lidsLine2, name: 'Бригада Б' },
    { id: TEAM.filmA, orgUnitId: UNIT.film, name: 'Бригада А' },
  ],
  zones: [
    {
      id: 'd0000000-0000-4000-8000-000000000001',
      siteId: SITE_MAIN,
      orgUnitId: UNIT.lidsLine1,
      code: 'L1',
      name: 'Линия 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000002',
      siteId: SITE_MAIN,
      orgUnitId: UNIT.lidsLine2,
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

/** The "many people" variant: 240 more operators spread across the main nodes. */
export function largeRoster(): EmployeeView[] {
  const units = [
    UNIT.lidsLine1,
    UNIT.lidsLine2,
    UNIT.film,
    UNIT.print,
    UNIT.warehouse,
    UNIT.repair,
  ];
  const extra = Array.from({ length: 240 }, (_, i) => ({
    n: 100 + i,
    unit: units[i % units.length] ?? UNIT.lids,
    position: i % 9 === 0 ? POSITION.adjuster : POSITION.operator,
  }));
  return [...roster, ...extra.map(employee)];
}
