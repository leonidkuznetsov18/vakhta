import { describe, expect, it } from 'vitest';
import { holidayRegion, holidaysBetween, nextAnniversary, orthodoxEaster } from './holidays.js';

describe('regional holidays', () => {
  it('maps Ukrainian timezones to the region and others to none', () => {
    expect(holidayRegion('Europe/Kyiv')).toBe('UA');
    expect(holidayRegion('Europe/Kiev')).toBe('UA');
    expect(holidayRegion('Europe/Warsaw')).toBeNull();
  });
  it('computes Orthodox Easter and Trinity in the Gregorian calendar', () => {
    expect(orthodoxEaster(2025)).toBe('2025-04-20');
    expect(orthodoxEaster(2026)).toBe('2026-04-12');
    expect(orthodoxEaster(2027)).toBe('2027-05-02');
    const list = holidaysBetween('UA', '2026-04-01', '2026-06-30');
    expect(list.map((h) => [h.date, h.code])).toEqual([
      ['2026-04-12', 'EASTER'],
      ['2026-05-01', 'LABOUR_DAY'],
      ['2026-05-08', 'REMEMBRANCE_DAY'],
      ['2026-05-31', 'TRINITY'],
      ['2026-06-28', 'CONSTITUTION_DAY'],
    ]);
  });
  it('lists holidays across a year boundary and none without a region', () => {
    expect(holidaysBetween('UA', '2026-12-20', '2027-01-05').map((h) => h.code)).toEqual([
      'CHRISTMAS',
      'NEW_YEAR',
    ]);
    expect(holidaysBetween(null, '2026-01-01', '2026-12-31')).toEqual([]);
  });
  it('finds the next birthday occurrence, today included, and moves 29 Feb to 1 Mar', () => {
    expect(nextAnniversary('1990-09-13', '2026-09-13')).toBe('2026-09-13');
    expect(nextAnniversary('1990-09-12', '2026-09-13')).toBe('2027-09-12');
    expect(nextAnniversary('1992-02-29', '2026-01-10')).toBe('2026-03-01');
  });
});
