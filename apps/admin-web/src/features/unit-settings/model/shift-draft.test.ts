import { describe, expect, it } from 'vitest';
import { ShiftPeriod, TemplateHoursIssue } from '@vakhta/domain';
import type { ShiftTemplateView } from '@vakhta/contracts';
import {
  NEW_SHIFT,
  canSubmit,
  draftIssues,
  draftOf,
  standardShifts,
  takenNames,
  unitShifts,
  withHours,
  withLength,
  withPeriod,
} from './shift-draft';

const UNIT = 'a0000000-0000-4000-8000-000000000001';
const template = (patch: Partial<ShiftTemplateView>): ShiftTemplateView => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  siteId: 'a0000000-0000-4000-8000-0000000000aa',
  orgUnitId: UNIT,
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
  ...patch,
});

describe('shift draft', () => {
  it('suggests the type from the hours until the administrator picks one', () => {
    const night = withHours(NEW_SHIFT, '22:00', '06:00');
    expect(night.period).toBe(ShiftPeriod.NIGHT);
    expect(withLength(night, 24)).toMatchObject({
      localEnd: '22:00',
      period: ShiftPeriod.FULL_DAY,
    });
    const chosen = withPeriod(NEW_SHIFT, ShiftPeriod.NIGHT);
    expect(withHours(chosen, '05:00', '13:00').period).toBe(ShiftPeriod.NIGHT);
  });

  it('sets the end from the start with a length preset and moves a full day to 24 hours', () => {
    expect(withLength({ ...NEW_SHIFT, localStart: '20:00' }, 12).localEnd).toBe('08:00');
    expect(withPeriod({ ...NEW_SHIFT, localStart: '07:30' }, ShiftPeriod.FULL_DAY)).toMatchObject({
      localEnd: '07:30',
      period: ShiftPeriod.FULL_DAY,
    });
  });

  it('reports hours, taken names and long names', () => {
    const taken = takenNames([template({}), template({ id: 'x', name: '' })], null);
    expect(draftIssues({ ...NEW_SHIFT, name: ' ранкова ' }, taken).nameTaken).toBe(true);
    expect(
      draftIssues({ ...NEW_SHIFT, name: '', localStart: '05:00', localEnd: '13:00' }, taken)
        .nameTaken,
    ).toBe(true);
    expect(draftIssues({ ...NEW_SHIFT, name: 'x'.repeat(61) }, taken).nameTooLong).toBe(true);
    expect(draftIssues({ ...NEW_SHIFT, period: ShiftPeriod.FULL_DAY }, new Set()).hours).toBe(
      TemplateHoursIssue.FULL_DAY_NEEDS_EQUAL_TIMES,
    );
  });

  it('enables saving only for a valid change, disabling it again after reverting', () => {
    const saved = draftOf(template({}));
    const none = draftIssues(saved, new Set());
    expect(canSubmit(saved, saved, none)).toBe(false);
    const edited = { ...saved, name: 'Рання' };
    expect(canSubmit(edited, saved, draftIssues(edited, new Set()))).toBe(true);
    expect(canSubmit({ ...edited, name: 'Ранкова ' }, saved, none)).toBe(false);
    expect(canSubmit(NEW_SHIFT, null, draftIssues(NEW_SHIFT, new Set()))).toBe(true);
  });

  it('lists the unit’s current shifts and the site defaults in display order', () => {
    const list = [
      template({
        id: 'n',
        name: 'Нічна',
        period: ShiftPeriod.NIGHT,
        localStart: '22:00',
        localEnd: '06:00',
      }),
      template({ id: 'm' }),
      template({ id: 'gone', isActive: false }),
      template({ id: 'other', orgUnitId: 'c0000000-0000-4000-8000-000000000001' }),
      template({ id: 'd', orgUnitId: null, name: 'Day', localStart: '08:00', localEnd: '20:00' }),
    ];
    expect(unitShifts(list, UNIT, 'uk').map((item) => item.id)).toEqual(['m', 'n']);
    expect(standardShifts(list, 'uk').map((item) => item.id)).toEqual(['d']);
  });
});
