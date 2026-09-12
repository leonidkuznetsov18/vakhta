import { describe, expect, it } from 'vitest';
import {
  calendarDates,
  calendarModel,
  calendarWeek,
  siteToday,
  type CalendarInput,
} from './calendar';
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
  publication: 'Published',
  recorded: [],
};
const allItems = (model: ReturnType<typeof calendarModel>) =>
  model.resources.flatMap((row) => row.cells.flatMap((cell) => cell.items));

describe('calendar projections', () => {
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
    expect(zones.resources[0]?.description).toBe('Staffing requirement not defined');
    expect(base.grid.rows[0]?.cells['2026-09-30']).toBe('night');
  });
  it('labels an overnight end with its next date and explicit duration', () => {
    const item = allItems(calendarModel(base))[0];
    expect(item?.time).toContain('20:00');
    expect(item?.time).toContain('10/01');
    expect(item?.time).toContain('12 hr');
    expect(item?.status).toBe('Local changes');
  });
  it('uses stored instants after a template changes and keeps read-only actions absent', () => {
    const model = calendarModel({
      ...base,
      writable: false,
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
        },
      ],
    });
    expect(allItems(model)[0]?.time).toContain('21:00');
    expect(allItems(model)[0]?.status).toBe('Published');
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
