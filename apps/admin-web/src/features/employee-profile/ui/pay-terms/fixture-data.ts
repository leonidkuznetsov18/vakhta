import {
  AssignmentState,
  ComponentKey,
  TermMode,
  TermSource,
  TermStatus,
  Unit,
  type Assignment,
  type Level,
  type PayTerms,
  type ResolvedComponent,
} from './model';

/** Prototype data for spec 015: one employment, a current assignment with a personal base, an
 * ended assignment in history, and one draft correction awaiting approval. */

export const LEVELS: readonly Level[] = [
  { id: 'l1', code: 'L1', name: 'Уровень 1', supplementPerHour: 0 },
  { id: 'l2', code: 'L2', name: 'Уровень 2', supplementPerHour: 20 },
  { id: 'l3', code: 'L3', name: 'Уровень 3', supplementPerHour: 35 },
];

const employment = {
  id: 'emp-1',
  employer: 'Работодатель А',
  contract: '№ 12 от 01.01.2026',
  currency: 'UAH',
  validFrom: '2026-01-01',
  validTo: null,
};

export const CURRENT_ASSIGNMENT_ID = 'as-2';

const assignments: Assignment[] = [
  {
    id: CURRENT_ASSIGNMENT_ID,
    employmentId: employment.id,
    nodePath: ['Производство', 'Цех Крышки', 'Линия 1'],
    position: 'Наладчик',
    level: LEVELS[1] ?? null,
    levelScale: LEVELS,
    payGroup: { name: 'ЗП наладчика', version: 3 },
    share: 100,
    fte: 1,
    isPrimary: true,
    validFrom: '2026-03-01',
    validTo: null,
    state: AssignmentState.ACTIVE,
  },
  {
    id: 'as-1',
    employmentId: employment.id,
    nodePath: ['Производство', 'Цех Крышки', 'Линия 2'],
    position: 'Оператор',
    level: LEVELS[0] ?? null,
    levelScale: LEVELS,
    payGroup: { name: 'ЗП оператора', version: 2 },
    share: 100,
    fte: 1,
    isPrimary: true,
    validFrom: '2026-01-01',
    validTo: '2026-03-01',
    state: AssignmentState.ENDED,
  },
];

const components: ResolvedComponent[] = [
  {
    key: ComponentKey.BASE_SALARY,
    unit: Unit.PER_MONTH,
    groupValue: 40000,
    groupSource: TermSource.GROUP_POSITION,
    groupSourceLabel: 'ЗП наладчика v3',
    personal: {
      mode: TermMode.REPLACE,
      value: 42000,
      validFrom: '2026-06-01',
      validTo: null,
      status: TermStatus.APPROVED,
      reason: 'Аттестация 05.2026, приказ № 41',
    },
    applied: 42000,
    appliedSource: TermSource.PERSONAL,
    path: [
      'Шаблон компании: оклад наладчика 38 000',
      'Центр: не задано',
      'Узел «Производство»: не задано',
      'Группа «ЗП наладчика» v3, должность Наладчик: 40 000',
      'Персонально с 01.06.2026: 42 000 (утверждено)',
    ],
  },
  {
    key: ComponentKey.LEVEL_SUPPLEMENT,
    unit: Unit.PER_HOUR,
    groupValue: 20,
    groupSource: TermSource.GROUP_LEVEL,
    groupSourceLabel: 'таблица уровней, Уровень 2',
    personal: null,
    applied: 20,
    appliedSource: TermSource.GROUP_LEVEL,
    path: [
      'Группа «ЗП наладчика» v3, таблица уровней: Уровень 2 = 20 / час',
      'Персонально: наследовать',
    ],
  },
  {
    key: ComponentKey.POINT_PRICE,
    unit: Unit.PER_POINT,
    groupValue: 100,
    groupSource: TermSource.CENTER,
    groupSourceLabel: 'центр → группа',
    personal: null,
    applied: 100,
    appliedSource: TermSource.CENTER,
    path: [
      'Центр: цена балла 100',
      'Группа «ЗП наладчика» v3: наследует центр',
      'Персонально: наследовать',
    ],
  },
  {
    key: ComponentKey.NIGHT_COEFFICIENT,
    unit: Unit.COEFFICIENT,
    groupValue: 1.2,
    groupSource: TermSource.NODE,
    groupSourceLabel: 'узел «Производство»',
    personal: null,
    applied: 1.2,
    appliedSource: TermSource.NODE,
    path: [
      'Правовой профиль: минимум 1.2 (обязательно)',
      'Узел «Производство»: 1.2',
      'Персонально: наследовать',
    ],
  },
  {
    key: ComponentKey.LEAD_SUPPLEMENT,
    unit: Unit.PER_MONTH,
    groupValue: null,
    groupSource: TermSource.MISSING,
    groupSourceLabel: 'в группе не задано',
    personal: {
      mode: TermMode.ADD,
      value: 1500,
      validFrom: '2026-09-01',
      validTo: '2026-12-31',
      status: TermStatus.DRAFT,
      reason: 'Руководство бригадой А на время отпуска бригадира',
    },
    applied: null,
    appliedSource: TermSource.MISSING,
    path: [
      'Группа: компонент не задан',
      'Персонально с 01.09.2026 по 31.12.2026: +1 500 / мес (черновик, ждёт утверждения)',
    ],
  },
];

export const payTerms: PayTerms = {
  employments: [employment],
  assignments,
  components: new Map([
    [CURRENT_ASSIGNMENT_ID, components],
    ['as-1', []],
  ]),
  adjustments: [
    {
      id: 'adj-1',
      kind: 'BONUS',
      amount: 1500,
      sourcePeriod: '2026-09',
      period: '2026-09',
      reason: 'Премия за запуск линии, приказ № 58',
      status: TermStatus.APPROVED,
      author: 'Ткач Олена',
    },
  ],
  history: [
    {
      id: 'h1',
      at: '2026-09-20',
      author: 'Ткач Олена',
      text: 'Черновик: доплата за бригаду +1 500 / мес с 01.09 по 31.12 (ждёт утверждения)',
    },
    {
      id: 'h2',
      at: '2026-09-12',
      author: 'Ткач Олена',
      text: 'Разовая премия 1 500 за сентябрь — утверждено (Петренко Сергій)',
    },
    {
      id: 'h3',
      at: '2026-06-01',
      author: 'HR',
      text: 'Оклад заменён персонально: 40 000 → 42 000, аттестация 05.2026 — утверждено',
    },
    {
      id: 'h4',
      at: '2026-03-01',
      author: 'HR',
      text: 'Перевод: Линия 2, Оператор → Линия 1, Наладчик; уровень 1 → 2; группа «ЗП оператора» v2 → «ЗП наладчика» v3',
    },
    {
      id: 'h5',
      at: '2026-01-01',
      author: 'Система',
      text: 'Миграция: ставка 1.00, оклад 40 000 из справочных условий оплаты',
    },
  ],
};

export const PLANNED_HOURS = 176;
export const MONTH = 'сентябрь 2026';
export const MONTH_KEY = '2026-09';
