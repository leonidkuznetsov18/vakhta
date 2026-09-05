import { describe, expect, it } from 'vitest';
import { isDepartureWithinWindow, pickArrivalAssignment } from './window.js';

const day = {
  id: 'day',
  planStartAt: new Date('2026-09-07T05:00:00Z'),
  planEndAt: new Date('2026-09-07T17:00:00Z'),
};
const night = {
  id: 'night',
  planStartAt: new Date('2026-09-07T17:00:00Z'),
  planEndAt: new Date('2026-09-08T05:00:00Z'),
};

describe('вікно приходу (FR-QR-03, FR-QR-05)', () => {
  it('за 3 години до початку і до кінця зміни прихід належить цій зміні', () => {
    expect(pickArrivalAssignment([day], new Date('2026-09-07T02:00:00Z'))?.id).toBe('day');
    expect(pickArrivalAssignment([day], new Date('2026-09-07T16:59:00Z'))?.id).toBe('day');
  });

  it('раніше за вікно або після кінця зміни підходящої зміни немає', () => {
    expect(pickArrivalAssignment([day], new Date('2026-09-07T01:59:00Z'))).toBeNull();
    expect(pickArrivalAssignment([day], new Date('2026-09-07T17:01:00Z'))).toBeNull();
    expect(pickArrivalAssignment([], new Date('2026-09-07T08:00:00Z'))).toBeNull();
  });

  it('коли підходять дві зміни впритул, береться та, що починається раніше', () => {
    expect(pickArrivalAssignment([night, day], new Date('2026-09-07T15:00:00Z'))?.id).toBe('day');
    expect(pickArrivalAssignment([night, day], new Date('2026-09-07T17:00:30Z'))?.id).toBe('night');
  });

  it('вікно налаштовується', () => {
    expect(
      pickArrivalAssignment([day], new Date('2026-09-07T04:30:00Z'), {
        arriveBeforeMinutes: 15,
        departAfterMinutes: 0,
      }),
    ).toBeNull();
  });
});

describe('вікно відходу (FR-TIME-05)', () => {
  it('відхід можливий до 3 годин після планового кінця', () => {
    expect(isDepartureWithinWindow(day, new Date('2026-09-07T19:59:00Z'))).toBe(true);
    expect(isDepartureWithinWindow(day, new Date('2026-09-07T20:01:00Z'))).toBe(false);
    expect(isDepartureWithinWindow(null, new Date('2026-09-07T23:00:00Z'))).toBe(true);
  });
});
