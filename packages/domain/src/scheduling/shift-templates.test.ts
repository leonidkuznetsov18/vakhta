import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planInstants } from '../time/plan.js';
import {
  TemplateHoursIssue,
  compareTemplates,
  endsNextDay,
  isTemplateSelectable,
  suggestPeriod,
  templateDisplayName,
  templateHoursIssue,
  templateLineage,
  templateMinutes,
  templatesForUnit,
} from './shift-templates.js';
import { SHIFT_PERIODS, ShiftPeriod } from './types.js';

const UNIT = 'unit-a';
const OTHER = 'unit-b';
const localTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

describe('suggestPeriod', () => {
  it('reads full day, night and day from the hours', () => {
    expect(suggestPeriod({ localStart: '08:00', localEnd: '08:00' })).toBe(ShiftPeriod.FULL_DAY);
    expect(suggestPeriod({ localStart: '22:00', localEnd: '06:00' })).toBe(ShiftPeriod.NIGHT);
    expect(suggestPeriod({ localStart: '18:00', localEnd: '23:00' })).toBe(ShiftPeriod.NIGHT);
    expect(suggestPeriod({ localStart: '05:00', localEnd: '13:00' })).toBe(ShiftPeriod.DAY);
    expect(suggestPeriod({ localStart: '12:00', localEnd: '18:00' })).toBe(ShiftPeriod.DAY);
  });

  it('always suggests a period the hours rule accepts', () => {
    fc.assert(
      fc.property(localTime, localTime, (localStart, localEnd) => {
        const hours = { localStart, localEnd };
        expect(templateHoursIssue(suggestPeriod(hours), hours)).toBeNull();
      }),
    );
  });
});

describe('templateHoursIssue', () => {
  it('requires equal times exactly for a full day', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SHIFT_PERIODS),
        localTime,
        localTime,
        (period, localStart, localEnd) => {
          const issue = templateHoursIssue(period, { localStart, localEnd });
          const valid = (period === ShiftPeriod.FULL_DAY) === (localStart === localEnd);
          expect(issue === null).toBe(valid);
        },
      ),
    );
    expect(
      templateHoursIssue(ShiftPeriod.FULL_DAY, { localStart: '08:00', localEnd: '20:00' }),
    ).toBe(TemplateHoursIssue.FULL_DAY_NEEDS_EQUAL_TIMES);
    expect(templateHoursIssue(ShiftPeriod.DAY, { localStart: '08:00', localEnd: '08:00' })).toBe(
      TemplateHoursIssue.EQUAL_TIMES_NEED_FULL_DAY,
    );
  });
});

describe('template length', () => {
  it('counts overnight and 24-hour shifts', () => {
    expect(templateMinutes({ localStart: '05:00', localEnd: '13:00' })).toBe(480);
    expect(templateMinutes({ localStart: '22:00', localEnd: '06:00' })).toBe(480);
    expect(templateMinutes({ localStart: '08:00', localEnd: '08:00' })).toBe(1440);
    expect(endsNextDay({ localStart: '22:00', localEnd: '06:00' })).toBe(true);
    expect(endsNextDay({ localStart: '08:00', localEnd: '08:00' })).toBe(true);
    expect(endsNextDay({ localStart: '05:00', localEnd: '13:00' })).toBe(false);
  });

  it('plans a full day across DST as the real 23 or 25 hours', () => {
    const fullDay = { localStart: '08:00', localEnd: '08:00' };
    expect(planInstants('2026-03-28', fullDay, 'Europe/Kyiv').durationMinutes).toBe(23 * 60);
    expect(planInstants('2026-10-24', fullDay, 'Europe/Kyiv').durationMinutes).toBe(25 * 60);
    expect(planInstants('2026-09-05', fullDay, 'Europe/Kyiv').durationMinutes).toBe(24 * 60);
  });
});

describe('unit scope', () => {
  const templates = [
    { id: 'day', orgUnitId: null, isActive: true },
    { id: 'retired-default', orgUnitId: null, isActive: false },
    { id: 'own', orgUnitId: UNIT, isActive: true },
    { id: 'deleted-own', orgUnitId: UNIT, isActive: false },
    { id: 'foreign', orgUnitId: OTHER, isActive: true },
  ];

  it('offers current defaults and the unit’s current templates only', () => {
    expect(templatesForUnit(templates, UNIT).map((t) => t.id)).toEqual(['day', 'own']);
    expect(templatesForUnit(templates, OTHER).map((t) => t.id)).toEqual(['day', 'foreign']);
  });

  it('never offers another unit’s or an inactive template', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            orgUnitId: fc.constantFrom(null, UNIT, OTHER),
            isActive: fc.boolean(),
          }),
        ),
        (list) => {
          for (const template of templatesForUnit(list, UNIT)) {
            expect(template.isActive).toBe(true);
            expect(template.orgUnitId === null || template.orgUnitId === UNIT).toBe(true);
          }
        },
      ),
    );
    expect(isTemplateSelectable({ orgUnitId: OTHER, isActive: true }, UNIT)).toBe(false);
  });
});

describe('display', () => {
  it('names an unnamed shift by its hours', () => {
    expect(templateDisplayName({ name: '  ', localStart: '05:00', localEnd: '13:00' })).toBe(
      '05:00–13:00',
    );
    expect(templateDisplayName({ name: 'Ранкова', localStart: '05:00', localEnd: '13:00' })).toBe(
      'Ранкова',
    );
  });

  it('orders by period, start, then name', () => {
    const list = [
      { name: 'Доба', period: ShiftPeriod.FULL_DAY, localStart: '08:00', localEnd: '08:00' },
      { name: 'Нічна', period: ShiftPeriod.NIGHT, localStart: '22:00', localEnd: '06:00' },
      { name: 'Коротка', period: ShiftPeriod.DAY, localStart: '12:00', localEnd: '18:00' },
      { name: 'Б', period: ShiftPeriod.DAY, localStart: '05:00', localEnd: '13:00' },
      { name: 'А', period: ShiftPeriod.DAY, localStart: '05:00', localEnd: '14:00' },
    ];
    expect([...list].sort(compareTemplates('uk')).map((t) => t.name)).toEqual([
      'А',
      'Б',
      'Коротка',
      'Нічна',
      'Доба',
    ]);
  });
});

describe('templateLineage', () => {
  it('leads every version to the current one and survives a broken cycle', () => {
    const head = templateLineage([
      { id: 'v1', replacedById: 'v2' },
      { id: 'v2', replacedById: 'v3' },
      { id: 'v3', replacedById: null },
      { id: 'loop-a', replacedById: 'loop-b' },
      { id: 'loop-b', replacedById: 'loop-a' },
    ]);
    expect(head('v1')).toBe('v3');
    expect(head('v3')).toBe('v3');
    expect(head('unknown')).toBe('unknown');
    expect(['loop-a', 'loop-b']).toContain(head('loop-a'));
  });
});
