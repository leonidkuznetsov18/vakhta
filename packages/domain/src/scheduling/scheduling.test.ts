import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addMonths, buildMonthPlan, monthDates } from './calendar.js';
import { diffSchedules } from './changes.js';
import { nextScheduleStatus, type PlannedShift } from './types.js';
import { DEFAULT_SCHEDULE_RULES, hasBlockingIssues, validateSchedule } from './validation.js';

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

describe('валідація графіка (ТЗ 3.2)', () => {
  it('чергування день/ніч з вихідними не дає помилок', () => {
    const own = [
      shift('a', 'e1', '2026-09-01', 'DAY'),
      shift('b', 'e1', '2026-09-02', 'DAY'),
      shift('c', 'e1', '2026-09-04', 'NIGHT'),
      shift('d', 'e1', '2026-09-05', 'NIGHT'),
    ];
    const issues = validateSchedule(own, []);
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('перетин змін є помилкою', () => {
    const own = [shift('a', 'e1', '2026-09-01', 'DAY'), shift('b', 'e1', '2026-09-01', 'NIGHT')];
    const issues = validateSchedule(own, []);
    expect(issues.map((i) => i.code)).toContain('DUPLICATE_DAY');
    const overlap = issues.find((i) => i.code === 'OVERLAP');
    expect(overlap).toBeUndefined();
    // День закінчується о 17:00Z, ніч починається о 17:00Z: перетину немає, але відпочинку 0.
    expect(issues.find((i) => i.code === 'REST_TOO_SHORT')?.details).toMatchObject({
      restMinutes: 0,
    });
  });

  it('відпочинок менше 11 годин є помилкою, 11 і більше ні', () => {
    const night = shift('n', 'e1', '2026-09-01', 'NIGHT'); // закінчується 02.09 05:00Z
    const nextDay = shift('d', 'e1', '2026-09-02', 'DAY'); // починається 02.09 05:00Z → 0 годин
    expect(validateSchedule([night, nextDay], []).map((i) => i.code)).toContain('REST_TOO_SHORT');

    const nextNight = shift('n2', 'e1', '2026-09-02', 'NIGHT'); // починається 02.09 17:00Z → 12 годин
    expect(validateSchedule([night, nextNight], []).filter((i) => i.severity === 'ERROR')).toEqual(
      [],
    );
  });

  it('враховує вже опубліковані зміни з іншого підрозділу або суміжного місяця', () => {
    const own = [shift('a', 'e1', '2026-09-01', 'DAY')];
    const context = [shift('ctx', 'e1', '2026-08-31', 'NIGHT')]; // закінчується 01.09 05:00Z
    const issues = validateSchedule(own, context);
    expect(issues.find((i) => i.code === 'REST_TOO_SHORT')?.assignmentIds).toEqual(['ctx', 'a']);
    // Помилки лише між контекстними змінами не звітуються.
    expect(
      validateSchedule(
        [],
        [shift('x', 'e1', '2026-09-01', 'DAY'), shift('y', 'e1', '2026-09-01', 'NIGHT')],
      ),
    ).toEqual([]);
  });

  it('попередження: години за місяць, дні поспіль, дисбаланс день/ніч', () => {
    const own: PlannedShift[] = [];
    for (let d = 1; d <= 20; d += 1) {
      own.push(shift(`d${d}`, 'e1', `2026-09-${String(d).padStart(2, '0')}`, 'DAY'));
    }
    const issues = validateSchedule(own, [], { ...DEFAULT_SCHEDULE_RULES, minRestMinutes: 600 });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('MONTH_HOURS_EXCEEDED');
    expect(codes).toContain('TOO_MANY_CONSECUTIVE_DAYS');
    expect(codes).toContain('NIGHT_SHARE_UNBALANCED');
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(issues.find((i) => i.code === 'TOO_MANY_CONSECUTIVE_DAYS')?.details).toMatchObject({
      days: 20,
    });
  });

  it('property: 2/2 (дві денні, дві нічні, два вихідні) ніколи не дає помилок', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (offset) => {
        const own: PlannedShift[] = [];
        const dates = monthDates('2026-09');
        dates.forEach((date, i) => {
          const phase = (i + offset) % 6;
          if (phase < 2) own.push(shift(`s${i}`, 'e1', date, 'DAY'));
          else if (phase < 4) own.push(shift(`s${i}`, 'e1', date, 'NIGHT'));
        });
        expect(hasBlockingIssues(validateSchedule(own, []))).toBe(false);
      }),
    );
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
