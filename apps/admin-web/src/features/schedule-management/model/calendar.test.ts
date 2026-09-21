import { messages } from '@vakhta/i18n';
import { calendarDates, calendarWeek } from './business-dates';
import { describe, expect, it } from 'vitest';
import { calendarModel, siteToday, type CalendarInput } from './calendar';
import { setAssignment, gridForZone, gridToItems, removeZoneAssignments } from './grid';
import { UNASSIGNED_ZONE } from './planning';

const base: CalendarInput = {
  grid: setAssignment(
    { rows: [] },
    {
      employeeId: 'person',
      businessDate: '2026-09-30',
      templateId: 'night',
      zoneId: 'zone',
      kind: 'REGULAR',
    },
  ),
  employees: [
    {
      id: 'person',
      personnelNumber: '001',
      fullName: 'A long worker name',
      status: 'ACTIVE',
      telegramLinked: true,
      email: null,
      phone: null,
      telegramUsername: null,
      currentPosition: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  templates: [
    {
      id: 'night',
      siteId: 'site',
      code: 'NIGHT',
      name: 'Night',
      localStart: '20:00',
      localEnd: '08:00',
      isNight: true,
      isActive: true,
    },
  ],
  zones: [
    {
      id: 'zone',
      siteId: 'site',
      orgUnitId: 'unit',
      code: 'Z1',
      name: 'Zone 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
    {
      id: 'empty',
      siteId: 'site',
      orgUnitId: 'unit',
      code: 'Z2',
      name: 'Empty zone',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
  ],
  dates: calendarDates('2026-09-28', 7),
  timezone: 'Europe/Kyiv',
  locale: 'en',
  grouping: 'zones',
  writable: true,
  published: { rows: [] },
  recorded: [],
};
const allItems = (model: ReturnType<typeof calendarModel>) =>
  model.resources.flatMap((row) => row.cells.flatMap((cell) => cell.items));

describe('calendar projections', () => {
  it.each(['uk', 'en', 'ru'] as const)(
    'marks terminated assignments gray and read-only in %s',
    (locale) => {
      const employees = base.employees.map((employee) => ({
        ...employee,
        status: 'TERMINATED' as const,
      }));
      const model = calendarModel({
        ...base,
        employees,
        locale,
        grouping: 'people',
        published: base.grid,
      });
      const item = allItems(model)[0];
      expect(item).toMatchObject({ tone: 'gray', readonly: true, unpublished: false });
      expect(item?.description).toContain(
        messages(locale).admin.administration.employees.statuses.TERMINATED,
      );
      expect(model.resources[0]?.cells[0]?.create?.disabledReason).toBe(
        messages(locale).scheduleWorkspace.terminatedReadOnly,
      );
    },
  );
  it('shows custom hours and zone segments as parts and treats a changed time as unpublished', () => {
    const custom = setAssignment(
      { rows: [] },
      {
        employeeId: 'person',
        businessDate: '2026-09-30',
        templateId: 'night',
        zoneId: 'zone',
        kind: 'REGULAR',
        customStart: '22:00',
        customEnd: '06:00',
        segments: [
          { zoneId: 'zone', localStart: '22:00', localEnd: '02:00' },
          { zoneId: 'empty', localStart: '02:00', localEnd: '06:00' },
        ],
      },
    );
    const item = allItems(calendarModel({ ...base, grid: custom, published: base.grid }))[0];
    expect(item?.time).toContain('22:00');
    expect(item?.time).toContain('06:00');
    expect(item?.description).toContain('8 hr');
    expect(item?.parts?.map((part) => part.label)).toEqual([
      '22:00–02:00 · Z1',
      '02:00–06:00 · Z2',
    ]);
    expect(item?.unpublished).toBe(true);
    const same = allItems(calendarModel({ ...base, grid: custom, published: custom }))[0];
    expect(same?.unpublished).toBe(false);
  });
  it('reports day and night counts per date and marks editable shifts removable', () => {
    const model = calendarModel(base);
    expect(model.dates.find((date) => date.id === '2026-09-30')?.counts).toEqual({
      day: 0,
      night: 1,
    });
    expect(model.dates.find((date) => date.id === '2026-09-29')?.counts).toEqual({
      day: 0,
      night: 0,
    });
    expect(model.removeLabel).toBe(messages('en').scheduleWorkspace.removeAssignment);
    expect(allItems(model)[0]?.removable).toBe(true);
    expect(allItems(calendarModel({ ...base, writable: false }))[0]?.removable).toBeUndefined();
    expect(
      allItems(calendarModel({ ...base, editableMonth: '2026-10' }))[0]?.removable,
    ).toBeUndefined();
  });
  it('distinguishes day and night by tone independently of publication status', () => {
    expect(allItems(calendarModel(base))[0]?.tone).toBe('indigo');
    const day = calendarModel({
      ...base,
      templates: base.templates.map((template) => ({ ...template, isNight: false })),
    });
    expect(allItems(day)[0]?.tone).toBe('amber');
    expect(allItems(calendarModel({ ...base, templates: [] }))[0]?.tone).toBe('neutral');
  });
  it('keeps all seven dates across month/year and DST boundaries', () => {
    expect(calendarWeek('2026-09-30')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(calendarWeek('2027-01-01')).toHaveLength(7);
    expect(calendarWeek('2026-10-25')).toContain('2026-10-25');
    expect(siteToday('Europe/Kyiv', new Date('2026-09-30T22:00:00Z'))).toBe('2026-10-01');
  });
  it('uses the same identities across grouping and retains empty active zones', () => {
    const zones = calendarModel(base);
    const people = calendarModel({ ...base, grouping: 'people' });
    expect(allItems(zones).map((item) => item.id)).toEqual(allItems(people).map((item) => item.id));
    expect(
      zones.resources
        .find((row) => row.id === 'empty')
        ?.cells.every((cell) => cell.items.length === 0),
    ).toBe(true);
    expect(zones.resources[0]?.description).toBe('Z1');
    expect(zones.resources[0]?.badge).toBeUndefined();
    expect(base.grid.rows[0]?.cells['2026-09-30']).toBe('night');
  });
  it('labels an overnight end with its next date and explicit duration', () => {
    const item = allItems(calendarModel(base))[0];
    expect(item?.time).toContain('20:00');
    expect(item?.time).toContain('10/01');
    expect(item?.description).toContain('12 hr');
    expect(item?.status).toBe('Not published');
    expect(item?.unpublished).toBe(true);
  });
  it('uses stored instants after a template changes and keeps read-only actions absent', () => {
    const model = calendarModel({
      ...base,
      writable: false,
      published: base.grid,
      recorded: [
        {
          id: 'assignment',
          scheduleVersionId: 'version',
          employeeId: 'person',
          templateId: 'night',
          templateCode: 'NIGHT',
          businessDate: '2026-09-30',
          planStartAt: '2026-09-30T18:00:00Z',
          planEndAt: '2026-10-01T06:00:00Z',
          positionId: null,
          orgUnitId: 'unit',
          teamId: null,
          zoneId: 'zone',
          kind: 'REGULAR',
          status: 'PLANNED',
          acknowledgedAt: null,
          customStart: null,
          customEnd: null,
          segments: [],
          breaks: [],
        },
      ],
    });
    expect(allItems(model)[0]?.time).toContain('21:00');
    expect(allItems(model)[0]?.status).toBe('');
    expect(allItems(model)[0]?.unpublished).toBe(false);
    expect(model.resources[0]?.summary).toContain('1');
    expect(model.dates.find((date) => date.id === '2026-09-30')?.summary).toContain('1');
    expect(model.resources.every((row) => row.cells.every((cell) => cell.create === null))).toBe(
      true,
    );
  });
  it('does not give filtered dates permission to delete hidden assignments', () => {
    const model = calendarModel({ ...base, dates: ['2026-09-29'] });
    expect(allItems(model)).toHaveLength(0);
    expect(base.grid.rows[0]?.cells['2026-09-30']).toBe('night');
  });
  it('applies the same zone filter to both projections without changing hidden draft data', () => {
    for (const grouping of ['zones', 'people'] as const) {
      expect(allItems(calendarModel({ ...base, grouping, zoneId: 'empty' }))).toHaveLength(0);
      expect(allItems(calendarModel({ ...base, grouping, zoneId: 'zone' }))).toHaveLength(1);
    }
    expect(base.grid.rows[0]?.cells['2026-09-30']).toBe('night');
  });
  it('blocks creating over an assignment hidden by the zone filter', () => {
    const model = calendarModel({ ...base, grouping: 'people', zoneId: 'empty' });
    const cell = model.resources[0]?.cells.find((value) => value.date === '2026-09-30');
    expect(cell?.items).toHaveLength(0);
    expect(cell?.create?.disabledReason).toBeTruthy();
    expect(gridToItems(base.grid)[0]?.zoneId).toBe('zone');
  });
  it('allows unassigned-zone creation and blocks adding a second shift to an occupied person day', () => {
    const grid = setAssignment(base.grid, {
      employeeId: 'person',
      businessDate: '2026-09-30',
      templateId: 'night',
      kind: 'REGULAR',
    });
    const zones = calendarModel({ ...base, grid });
    expect(
      zones.resources.find((row) => row.id === UNASSIGNED_ZONE)?.cells[0]?.create?.disabledReason,
    ).toBeUndefined();
    const people = calendarModel({ ...base, grid, grouping: 'people' });
    expect(
      people.resources[0]?.cells.find((cell) => cell.date === '2026-09-30')?.create?.disabledReason,
    ).toBeTruthy();
  });
  it('projects a monthly zone and removes only its assignments from the full draft', () => {
    const grid = setAssignment(base.grid, {
      employeeId: 'person',
      businessDate: '2026-09-29',
      templateId: 'night',
      zoneId: 'empty',
      kind: 'EXTRA',
      teamId: 'team',
    });
    expect(gridToItems(gridForZone(grid, 'zone'))).toHaveLength(1);
    const next = removeZoneAssignments(grid, 'person', 'zone');
    expect(gridToItems(next)).toEqual([
      {
        employeeId: 'person',
        businessDate: '2026-09-29',
        templateId: 'night',
        zoneId: 'empty',
        kind: 'EXTRA',
        teamId: 'team',
      },
    ]);
    expect(gridToItems(grid)).toHaveLength(2);
  });
});

describe('cell ordering', () => {
  const day = {
    id: 'day',
    siteId: 'site',
    code: 'DAY',
    name: 'Day',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
    isActive: true,
  };
  const worker = (id: string, fullName: string) => ({ ...base.employees[0]!, id, fullName });
  const assign = (grid: CalendarInput['grid'], employeeId: string, templateId: string) =>
    setAssignment(grid, {
      employeeId,
      businessDate: '2026-09-30',
      templateId,
      zoneId: 'zone',
      kind: 'REGULAR',
    });

  it('lists cards by start time, then name, then open slots regardless of roster order', () => {
    const grid = assign(assign(assign({ rows: [] }, 'zed', 'night'), 'bob', 'day'), 'ann', 'night');
    const model = calendarModel({
      ...base,
      grid,
      employees: [worker('zed', 'Zed'), worker('bob', 'Bob'), worker('ann', 'Ann')],
      templates: [...base.templates, day],
      slots: [
        {
          id: 'open-day',
          siteId: 'site',
          orgUnitId: 'unit',
          zoneId: 'zone',
          businessDate: '2026-09-30',
          templateId: 'day',
          status: 'OPEN',
          createdAt: '2026-09-01T00:00:00Z',
        } as unknown as NonNullable<CalendarInput['slots']>[number],
      ],
    });
    const cell = model.resources[0]!.cells.find((c) => c.date === '2026-09-30')!;
    expect(cell.items.map((item) => item.title)).toEqual(['Bob', 'Open slot', 'Ann', 'Zed']);
  });

  it('keeps the same order after a card moves into a cell with other cards', () => {
    const moved = assign(
      assign(assign({ rows: [] }, 'ann', 'night'), 'zed', 'night'),
      'mid',
      'night',
    );
    const model = calendarModel({
      ...base,
      grid: moved,
      employees: [worker('mid', 'Mid'), worker('zed', 'Zed'), worker('ann', 'Ann')],
    });
    const cell = model.resources[0]!.cells.find((c) => c.date === '2026-09-30')!;
    expect(cell.items.map((item) => item.title)).toEqual(['Ann', 'Mid', 'Zed']);
  });
});

describe('cross-month and DST projections', () => {
  it('marks another month as read only and blocks creation there with the month named', () => {
    const model = calendarModel({
      ...base,
      dates: calendarDates('2026-09-28', 7),
      editableMonth: '2026-10',
    });
    const item = allItems(model)[0];
    expect(item?.readonly).toBe(true);
    const september = model.resources[0]?.cells.find((cell) => cell.date === '2026-09-30');
    expect(september?.create?.disabledReason).toContain('September 2026');
    const october = model.resources[0]?.cells.find((cell) => cell.date === '2026-10-01');
    expect(october?.create?.disabledReason).toBeUndefined();
  });
  it('shows the elapsed duration of a night shift across the DST transition', () => {
    const model = calendarModel({
      ...base,
      grid: setAssignment(
        { rows: [] },
        {
          employeeId: 'person',
          businessDate: '2026-10-24',
          templateId: 'night',
          zoneId: 'zone',
          kind: 'REGULAR',
        },
      ),
      dates: calendarDates('2026-10-19', 7),
    });
    const item = allItems(model)[0];
    expect(item?.time).toContain('20:00');
    expect(item?.time).toContain('10/25');
    expect(item?.description).toContain('13 hr');
  });
});

describe('staffing coverage projection', () => {
  const rule = {
    id: 'rule',
    zoneId: 'zone',
    templateId: 'night',
    requiredCount: 2,
    qualificationId: null,
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
  };
  it('shows unknown for a zone without requirements and a shortage with per-template counts', () => {
    const model = calendarModel({
      ...base,
      coverage: {
        ready: true,
        known: new Set(['zone']),
        cells: [
          {
            zoneId: 'zone',
            businessDate: '2026-09-30',
            templateId: 'night',
            requirementId: rule.id,
            qualificationId: null,
            required: 2,
            eligible: 1,
            missing: 1,
            status: 'SHORT',
            onBreak: 0,
          },
        ],
      },
    });
    const zone = model.resources.find((row) => row.id === 'zone');
    expect(zone?.badge).toEqual({ text: 'Missing: 1', tone: 'danger' });
    expect(zone?.cells.find((cell) => cell.date === '2026-09-30')?.note).toEqual({
      text: 'N 1/2',
      tone: 'danger',
    });
    expect(model.resources.find((row) => row.id === 'empty')?.badge).toEqual({
      text: 'Staffing requirement not defined',
      tone: 'muted',
    });
    expect(
      calendarModel({
        ...base,
        grouping: 'people',
        coverage: { ready: true, known: new Set(['zone']), cells: [] },
      }).resources[0]?.badge,
    ).toBeUndefined();
  });
});
