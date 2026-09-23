import { describe, expect, it } from 'vitest';
import type { EmployeeChanges, PlannedShift } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import {
  MAX_CHANGE_LINES,
  MAX_NOTICE_CHARS,
  scheduleChangedText,
  schedulePublishedText,
} from './schedule-change-notice.js';

const ZONE = 'z0000000-0000-4000-8000-000000000001';
const input = {
  periodMonth: '2026-09',
  timezone: 'Europe/Kyiv',
  zoneNames: new Map([[ZONE, 'First cup wall']]),
  reason: null,
};

function shift(businessDate: string, isNight = false, zoneId: string | null = null): PlannedShift {
  const start = isNight ? '17:00' : '05:00';
  const startAt = new Date(`${businessDate}T${start}:00Z`);
  return {
    id: `${businessDate}-${isNight}`,
    employeeId: 'e1',
    businessDate,
    planStartAt: startAt,
    planEndAt: new Date(startAt.getTime() + 12 * 3_600_000),
    isNight,
    templateCode: isNight ? 'NIGHT' : 'DAY',
    zoneId,
  };
}

const none: EmployeeChanges = { added: [], removed: [], changed: [] };

describe('schedule change notice', () => {
  it('names every change with weekday, date, hours and zone in date order', () => {
    const text = scheduleChangedText(
      messages('uk'),
      {
        added: [shift('2026-09-27', false, ZONE)],
        removed: [shift('2026-09-22', true)],
        changed: [{ before: shift('2026-09-19'), after: shift('2026-09-19', true, ZONE) }],
      },
      { ...input, reason: 'Субота робоча' },
    );
    expect(text.split('\n')).toEqual([
      '📅 Ваш графік на вересень 2026 змінено:',
      '',
      '🔄 Змінено сб 19.09: денна 08:00–20:00 → нічна 20:00–08:00 · First cup wall',
      '❌ Скасовано вт 22.09: нічна 20:00–08:00',
      '➕ Додано нд 27.09: денна 08:00–20:00 · First cup wall',
      '',
      'Причина: Субота робоча',
    ]);
  });

  it('names a change of kind, team or position without an arrow between equal hours', () => {
    const before = shift('2026-09-19');
    const text = scheduleChangedText(
      messages('en'),
      { ...none, changed: [{ before, after: { ...before, kind: 'EXTRA' } }] },
      input,
    );
    expect(text.split('\n').at(-1)).toBe('🔄 Changed Sat 19.09: day 08:00–20:00');
  });

  it('keeps long lists short and says how many lines are hidden', () => {
    const added = Array.from({ length: MAX_CHANGE_LINES + 3 }, (_, i) =>
      shift(`2026-09-${String(i + 1).padStart(2, '0')}`),
    );
    const lines = scheduleChangedText(messages('en'), { ...none, added }, input).split('\n');
    expect(lines.filter((line) => line.startsWith('➕'))).toHaveLength(MAX_CHANGE_LINES);
    expect(lines.at(-1)).toBe('…and 3 more');
  });

  it('stays within the Telegram text limit with the longest zone names and reason', () => {
    const zone = 'Z'.repeat(200);
    const changed = Array.from({ length: MAX_CHANGE_LINES }, (_, i) => {
      const date = `2026-09-${String(i + 1).padStart(2, '0')}`;
      return { before: shift(date, false, ZONE), after: shift(date, true, ZONE) };
    });
    const text = scheduleChangedText(
      messages('uk'),
      { ...none, changed },
      { ...input, zoneNames: new Map([[ZONE, zone]]), reason: 'R'.repeat(1000) },
    );
    expect(text.length).toBeLessThanOrEqual(MAX_NOTICE_CHARS);
    expect(text).toMatch(/…і ще \d+\n\nПричина: R{1000}$/);
  });

  it('announces a first publication with the shift count and optional reason', () => {
    expect(schedulePublishedText(messages('ru'), 15, input)).toBe(
      '📅 Опубликован ваш график на сентябрь 2026. Смен в месяце: 15.',
    );
    expect(schedulePublishedText(messages('en'), 2, { ...input, reason: 'New rota' })).toContain(
      '\n\nReason: New rota',
    );
  });
});
