import { afterEach, describe, expect, it } from 'vitest';
import { IntervalUnit } from '@vakhta/domain';
import { formatInterval } from './format';

function chooseLocale(locale: string): void {
  localStorage.setItem('vakhta.locale', locale);
}

describe('formatInterval', () => {
  afterEach(() => localStorage.clear());

  it('names one period plainly and picks the Ukrainian word form by count', () => {
    chooseLocale('uk');
    expect(formatInterval({ intervalUnit: IntervalUnit.WEEK, intervalCount: 1 })).toBe(
      'кожен тиждень',
    );
    expect(formatInterval({ intervalUnit: IntervalUnit.DAY, intervalCount: 3 })).toBe(
      'кожні 3 дні',
    );
    expect(formatInterval({ intervalUnit: IntervalUnit.MONTH, intervalCount: 5 })).toBe(
      'кожні 5 місяців',
    );
    expect(formatInterval({ intervalUnit: IntervalUnit.DAY, intervalCount: 21 })).toBe(
      'кожні 21 день',
    );
  });

  it('uses the English and Russian plural rules', () => {
    chooseLocale('en');
    expect(formatInterval({ intervalUnit: IntervalUnit.MONTH, intervalCount: 4 })).toBe(
      'every 4 months',
    );
    chooseLocale('ru');
    expect(formatInterval({ intervalUnit: IntervalUnit.WEEK, intervalCount: 2 })).toBe(
      'каждые 2 недели',
    );
  });
});
