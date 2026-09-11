import { describe, expect, it } from 'vitest';
import { incidentPeriod } from './period';

describe('incident inclusive calendar ranges', () => {
  it('includes the complete final day across a DST change', () => {
    expect(incidentPeriod('day', '2026-10-24', 'Europe/Kyiv', '2026-10-26')).toEqual({
      from: '2026-10-23T21:00:00.000Z',
      to: '2026-10-26T22:00:00.000Z',
    });
  });
  it('includes complete months across year boundaries and a leap February', () => {
    expect(incidentPeriod('month', '2027-12-01', 'Europe/Kyiv', '2028-02-01')).toEqual({
      from: '2027-11-30T22:00:00.000Z',
      to: '2028-02-29T22:00:00.000Z',
    });
  });
  it('includes whole years, handles reverse input and preserves all-time', () => {
    expect(incidentPeriod('year', '2028-01-01', 'Europe/Kyiv', '2026-01-01')).toEqual({
      from: '2025-12-31T22:00:00.000Z',
      to: '2028-12-31T22:00:00.000Z',
    });
    expect(incidentPeriod('all', '2026-01-01', 'Europe/Kyiv', '2028-01-01')).toEqual({});
  });
});

it('supports independent date bounds and clearing both fields', () => {
  expect(incidentPeriod('range', '2026-10-25', 'Europe/Kyiv', '')).toEqual({
    from: '2026-10-24T21:00:00.000Z',
  });
  expect(incidentPeriod('range', '', 'Europe/Kyiv', '2026-10-25')).toEqual({
    to: '2026-10-25T22:00:00.000Z',
  });
  expect(incidentPeriod('range', '', 'Europe/Kyiv', '')).toEqual({});
});
