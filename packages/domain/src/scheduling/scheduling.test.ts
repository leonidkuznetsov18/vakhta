import { describe, expect, it } from 'vitest';
import { addMonths, buildMonthPlan, monthDates } from './calendar.js';
import { diffSchedules } from './changes.js';
import { nextScheduleStatus, type PlannedShift } from './types.js';

/** Київ, вересень 2026 (UTC+3): день 08–20 = 05:00Z–17:00Z, ніч 20–08 = 17:00Z–05:00Z+1. */
function shift(
  id: string,
  employeeId: string,
  businessDate: string,
  kind: 'DAY' | 'NIGHT',
  zoneId: string | null = null,
): PlannedShift {
  const start = new Date(`${businessDate}T${kind === 'DAY' ? '05:00' : '17:00'}:00Z`);
  const end = new Date(start.getTime() + 12 * 3_600_000);
  return {
    id,
    employeeId,
    businessDate,
    planStartAt: start,
    planEndAt: end,
    isNight: kind === 'NIGHT',
    templateCode: kind,
    zoneId,
  };
}

describe('життєвий цикл версії (ТЗ 3.1)', () => {
  it('дозволяє лише переходи з таблиці', () => {
    expect(nextScheduleStatus('DRAFT', 'SUBMIT')).toBe('IN_REVIEW');
    expect(nextScheduleStatus('IN_REVIEW', 'RETURN')).toBe('DRAFT');
    expect(nextScheduleStatus('IN_REVIEW', 'PUBLISH')).toBe('PUBLISHED');
    expect(nextScheduleStatus('PUBLISHED', 'SUPERSEDE')).toBe('SUPERSEDED');
    expect(nextScheduleStatus('PUBLISHED', 'CLOSE')).toBe('CLOSED');
    expect(nextScheduleStatus('DRAFT', 'PUBLISH')).toBeNull();
    expect(nextScheduleStatus('PUBLISHED', 'SUBMIT')).toBeNull();
    expect(nextScheduleStatus('CLOSED', 'RETURN')).toBeNull();
  });
});

describe('календар місяця (FR-SCH-01)', () => {
  it('будує всі дні місяця з видом дня і підсумками', () => {
    const plan = buildMonthPlan(
      [
        shift('a', 'e1', '2026-09-01', 'DAY'),
        shift('b', 'e1', '2026-09-03', 'NIGHT'),
        shift('z', 'e1', '2026-10-01', 'DAY'),
      ],
      '2026-09',
    );
    expect(plan.days).toHaveLength(30);
    expect(plan.days[0]).toMatchObject({ date: '2026-09-01', weekday: 2, kind: 'DAY' });
    expect(plan.days[2]?.kind).toBe('NIGHT');
    expect(plan.days[1]?.kind).toBe('OFF');
    expect(plan.totals).toEqual({ shifts: 2, plannedMinutes: 1440, dayShifts: 1, nightShifts: 1 });
  });

  it('дати місяця й арифметика місяців', () => {
    expect(monthDates('2026-02')).toHaveLength(28);
    expect(monthDates('2028-02')).toHaveLength(29);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(() => monthDates('2026-13')).toThrow(RangeError);
  });
});

describe('різниця версій (FR-SCH-03)', () => {
  it.each([{ kind: 'EXTRA' as const }, { teamId: 'team-2' }, { positionId: 'position-2' }])(
    'reports metadata-only additions and removals for the affected employee: %j',
    (metadata) => {
      const before = shift('old', 'changed', '2026-09-01', 'DAY');
      const after = { ...before, id: 'new', ...metadata };
      const unchanged = shift('other-old', 'unchanged', '2026-09-01', 'DAY');
      for (const [previous, next] of [
        [before, after],
        [after, before],
      ] as const) {
        const diff = diffSchedules(
          [previous, unchanged],
          [next, { ...unchanged, id: 'other-new' }],
        );
        expect([...diff.keys()]).toEqual(['changed']);
        expect(diff.get('changed')).toEqual({
          added: [],
          removed: [],
          changed: [{ before: previous, after: next }],
        });
      }
    },
  );

  it('treats absent metadata as REGULAR/null and ignores regenerated assignment IDs', () => {
    const legacy = shift('old', 'employee', '2026-09-01', 'DAY');
    const explicit = {
      ...legacy,
      id: 'new',
      kind: 'REGULAR' as const,
      teamId: null,
      positionId: null,
    };
    expect(diffSchedules([legacy], [explicit]).size).toBe(0);
    expect(diffSchedules([explicit], [legacy]).size).toBe(0);
    const populated = {
      ...explicit,
      kind: 'SWAP' as const,
      teamId: 'team',
      positionId: 'position',
    };
    expect(diffSchedules([populated], [{ ...populated, id: 'another-new-id' }]).size).toBe(0);
  });

  it('знаходить додані, скасовані і змінені зміни по працівнику', () => {
    const prev = [
      shift('a', 'e1', '2026-09-01', 'DAY', 'z1'),
      shift('b', 'e1', '2026-09-02', 'DAY'),
      shift('c', 'e2', '2026-09-01', 'NIGHT'),
    ];
    const next = [
      shift('a2', 'e1', '2026-09-01', 'NIGHT', 'z1'),
      shift('d', 'e1', '2026-09-03', 'DAY'),
      shift('c2', 'e2', '2026-09-01', 'NIGHT'),
    ];
    const diff = diffSchedules(prev, next);
    expect(diff.get('e1')).toMatchObject({
      added: [expect.objectContaining({ id: 'd' })],
      removed: [expect.objectContaining({ id: 'b' })],
      changed: [
        {
          before: expect.objectContaining({ id: 'a' }),
          after: expect.objectContaining({ id: 'a2' }),
        },
      ],
    });
    expect(diff.has('e2')).toBe(false);
  });
});
