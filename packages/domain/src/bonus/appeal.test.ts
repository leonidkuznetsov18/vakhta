import { describe, expect, it } from 'vitest';
import { canAppealScore } from './appeal.js';

const computedAt = new Date('2026-09-07T12:00:00Z');
const days = (n: number) => new Date(computedAt.getTime() + n * 86_400_000);

describe('canAppealScore (spec 7.7)', () => {
  it('allows a scored shift within the window plus weekend slack', () => {
    expect(canAppealScore({ status: 'PRELIMINARY', computedAt }, days(1), 3)).toBe(true);
    expect(canAppealScore({ status: 'CONFIRMED', computedAt }, days(5), 3)).toBe(true);
  });
  it('refuses after the window', () => {
    expect(canAppealScore({ status: 'PRELIMINARY', computedAt }, days(5.01), 3)).toBe(false);
  });
  it('refuses an appealed or unscored shift', () => {
    expect(canAppealScore({ status: 'APPEALED', computedAt }, days(0), 3)).toBe(false);
    expect(canAppealScore({ status: 'NOT_EVALUATED', computedAt }, days(0), 3)).toBe(false);
  });
});
