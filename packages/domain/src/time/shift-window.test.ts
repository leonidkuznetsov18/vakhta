import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { minutesUntil, shiftContext, type SiteShiftTemplate } from './shift-window.js';
import { ShiftPeriod } from '../scheduling/types.js';

const TZ = 'Europe/Kyiv';
const TEMPLATES: SiteShiftTemplate[] = [
  {
    id: 'd',
    code: 'DAY',
    name: 'Day',
    localStart: '08:00',
    localEnd: '20:00',
    period: ShiftPeriod.DAY,
  },
  {
    id: 'n',
    code: 'NIGHT',
    name: 'Night',
    localStart: '20:00',
    localEnd: '08:00',
    period: ShiftPeriod.NIGHT,
  },
];
const GRACE = 120;

describe('shift context (spec 004 D-02, AC-004–AC-007)', () => {
  it('AC-004: 11:45 local is the day shift with 8 h 15 min left', () => {
    const now = new Date('2026-09-13T08:45:00Z'); // 11:45 EEST
    const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
    expect(ctx.current).toMatchObject({ code: 'DAY', businessDate: '2026-09-13' });
    expect(minutesUntil(ctx.current!.endsAt, now)).toBe(8 * 60 + 15);
    expect(ctx.closingPrevious).toBeNull();
    expect(ctx.next).toMatchObject({ code: 'NIGHT', businessDate: '2026-09-13' });
  });

  it('AC-005: 01:30 local belongs to the night shift of the previous date', () => {
    const now = new Date('2026-09-12T22:30:00Z'); // 01:30 on 13.09 EEST
    const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
    expect(ctx.current).toMatchObject({ code: 'NIGHT', businessDate: '2026-09-12' });
  });

  it('AC-006: 21:10 local runs the night shift while the day shift closes until 22:00', () => {
    const now = new Date('2026-09-13T18:10:00Z'); // 21:10 EEST
    const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
    expect(ctx.current).toMatchObject({ code: 'NIGHT', businessDate: '2026-09-13' });
    expect(ctx.closingPrevious).toMatchObject({ code: 'DAY', businessDate: '2026-09-13' });
    expect(ctx.closingPrevious!.closesAt.toISOString()).toBe('2026-09-13T19:00:00.000Z');
  });

  it('AC-007: the DST night lasts 13 hours and remaining time follows instants', () => {
    // 2026-10-25 04:00 EEST → 03:00 EET; night 24.10 20:00 EEST (17:00Z) to 25.10 08:00 EET (06:00Z)
    const now = new Date('2026-10-25T00:00:00Z');
    const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
    expect(ctx.current).toMatchObject({ code: 'NIGHT', businessDate: '2026-10-24' });
    expect(ctx.current!.endsAt.getTime() - ctx.current!.startsAt.getTime()).toBe(13 * 3_600_000);
    expect(minutesUntil(ctx.current!.endsAt, now)).toBe(6 * 60);
  });

  it('DST forward night: the night that started before the change is running after local midnight', () => {
    // fast-check counterexample: 2026-03-29T21:00Z = 30.03 00:00 EEST, one day after 29.03 03:00 DST
    const now = new Date(1774818000000);
    const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
    expect(ctx.current).toMatchObject({ code: 'NIGHT', businessDate: '2026-03-29' });
    expect(ctx.current!.endsAt.toISOString()).toBe('2026-03-30T05:00:00.000Z');
  });

  it('no templates means no context', () => {
    expect(shiftContext([], TZ, new Date(), GRACE)).toEqual({
      current: null,
      closingPrevious: null,
      next: null,
    });
  });

  it('property: with day+night templates every instant has exactly one running shift containing it', () => {
    const from = new Date('2026-01-01T00:00:00Z').getTime();
    const to = new Date('2027-01-01T00:00:00Z').getTime();
    fc.assert(
      fc.property(fc.integer({ min: from, max: to }), (ms) => {
        const now = new Date(ms);
        const ctx = shiftContext(TEMPLATES, TZ, now, GRACE);
        expect(ctx.current).not.toBeNull();
        expect(ctx.current!.startsAt.getTime()).toBeLessThanOrEqual(ms);
        expect(ctx.current!.endsAt.getTime()).toBeGreaterThan(ms);
        expect(ctx.next!.startsAt.getTime()).toBeGreaterThan(ms);
        if (ctx.closingPrevious) {
          expect(ctx.closingPrevious.closesAt.getTime()).toBeGreaterThan(ms);
          expect(ctx.closingPrevious.endsAt.getTime()).toBeLessThanOrEqual(ms);
        }
      }),
      { numRuns: 300 },
    );
  });
});
