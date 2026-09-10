import { describe, expect, it } from 'vitest';
import { calendarPeriod } from './plan.js';

describe('site calendar periods', () => {
  it('uses a 25-hour autumn DST day', () => {
    expect(calendarPeriod('2026-10-25', 'day', 'Europe/Kyiv')).toEqual({
      from: '2026-10-24T21:00:00.000Z',
      to: '2026-10-25T22:00:00.000Z',
    });
  });
  it('uses calendar month and year boundaries', () => {
    expect(calendarPeriod('2026-09-10', 'month', 'Europe/Kyiv')).toEqual({
      from: '2026-08-31T21:00:00.000Z',
      to: '2026-09-30T21:00:00.000Z',
    });
    expect(calendarPeriod('2026-09-10', 'year', 'Europe/Kyiv')).toEqual({
      from: '2025-12-31T22:00:00.000Z',
      to: '2026-12-31T22:00:00.000Z',
    });
  });
});
