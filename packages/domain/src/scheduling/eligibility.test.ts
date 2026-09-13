import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULING_RULES,
  eligibilityStatus,
  evaluatePlan,
  reasonsFor,
  type PlannedInterval,
} from './eligibility.js';

const H = 3_600_000;
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;
const at = (n: number, hour: number) => Date.UTC(2026, 8, n, hour);
const shift = (
  employeeId: string,
  n: number,
  startHour: number,
  hours: number,
  extra: Partial<PlannedInterval> = {},
): PlannedInterval => ({
  employeeId,
  businessDate: day(n),
  startMs: at(n, startHour),
  endMs: at(n, startHour) + hours * H,
  templateId: startHour >= 17 ? 'night' : 'day',
  zoneId: 'z1',
  ...extra,
});
const base = {
  context: [],
  absences: [],
  preferences: [],
  rules: DEFAULT_SCHEDULING_RULES,
  staffing: { requirements: [], holdings: [] },
  month: '2026-09',
};

describe('plan eligibility (SC-02/05/06/17/33)', () => {
  it('blocks overlapping intervals across units and accepts adjacent ones', () => {
    const reasons = evaluatePlan({
      ...base,
      proposed: [shift('a', 5, 5, 12), shift('a', 6, 5, 12)],
      context: [
        shift('a', 5, 10, 8, { orgUnitId: 'other' }),
        shift('a', 6, 17, 12, { orgUnitId: 'other' }),
      ],
    });
    expect(reasons.filter((reason) => reason.code === 'OVERLAP')).toEqual([
      expect.objectContaining({
        employeeId: 'a',
        businessDate: day(5),
        severity: 'BLOCK',
        detail: { withDate: day(5), orgUnitId: 'other' },
      }),
    ]);
    expect(eligibilityStatus(reasonsFor(reasons, 'a', day(6)))).not.toBe('BLOCKED');
    expect(
      reasons.some((reason) => reason.code === 'OVERLAP' && reason.businessDate === day(6)),
    ).toBe(false);
  });
  it('rejects two individually valid additions that conflict together', () => {
    const reasons = evaluatePlan({
      ...base,
      proposed: [shift('a', 5, 5, 12, { zoneId: 'z1' }), shift('a', 5, 8, 4, { zoneId: 'z2' })],
    });
    expect(reasons.map((reason) => reason.code)).toContain('OVERLAP');
  });
  it('warns about short rest across an overnight transition and blocks when configured', () => {
    const proposed = [shift('a', 5, 17, 12), shift('a', 6, 8, 12)];
    const warn = evaluatePlan({ ...base, proposed });
    expect(warn).toEqual([
      expect.objectContaining({
        code: 'REST',
        severity: 'WARN',
        businessDate: day(6),
        detail: { restMinutes: 180, minRestMinutes: 660, withDate: day(5) },
      }),
    ]);
    const block = evaluatePlan({
      ...base,
      proposed,
      rules: { ...DEFAULT_SCHEDULING_RULES, restSeverity: 'BLOCK' },
    });
    expect(eligibilityStatus(block)).toBe('BLOCKED');
    expect(
      evaluatePlan({ ...base, proposed: [shift('a', 5, 5, 12), shift('a', 6, 5, 12)] }),
    ).toEqual([]);
  });
  it('totals month hours with context from other units and names the limit', () => {
    const proposed = Array.from({ length: 16 }, (_, index) => shift('a', index + 1, 5, 12));
    const context = [
      shift('a', 20, 5, 12, { orgUnitId: 'other' }),
      shift('a', 21, 5, 12, { orgUnitId: 'other' }),
    ];
    const reasons = evaluatePlan({ ...base, proposed, context });
    expect(reasons).toEqual([
      expect.objectContaining({
        code: 'MONTH_HOURS',
        businessDate: day(16),
        detail: { monthMinutes: 216 * 60, maxMonthMinutes: 200 * 60, month: '2026-09' },
      }),
    ]);
    expect(evaluatePlan({ ...base, proposed: proposed.slice(0, 14), context })).toEqual([]);
  });
  it('blocks approved absences, warns for pending ones and unavailable preferences, blocks missing qualifications', () => {
    const reasons = evaluatePlan({
      ...base,
      proposed: [shift('a', 5, 5, 12), shift('a', 12, 5, 12), shift('b', 13, 5, 12)],
      absences: [
        { employeeId: 'a', from: day(4), to: day(6), type: 'VACATION', status: 'APPROVED' },
        { employeeId: 'a', from: day(12), to: day(12), type: 'DAY_OFF', status: 'PENDING' },
      ],
      preferences: [
        {
          employeeId: 'b',
          kind: 'UNAVAILABLE',
          weekday: 0,
          date: null,
          validFrom: day(1),
          validTo: null,
        },
        {
          employeeId: 'a',
          kind: 'PREFERRED',
          weekday: null,
          date: day(5),
          validFrom: day(1),
          validTo: null,
        },
      ],
      staffing: {
        requirements: [
          {
            id: 'r',
            zoneId: 'z1',
            templateId: 'day',
            requiredCount: 1,
            qualificationId: 'q',
            effectiveFrom: day(1),
            effectiveTo: null,
          },
        ],
        holdings: [{ employeeId: 'a', qualificationId: 'q', validFrom: day(1), validUntil: null }],
      },
    });
    expect(reasonsFor(reasons, 'a', day(5)).map((reason) => reason.code)).toEqual(['ABSENCE']);
    expect(reasonsFor(reasons, 'a', day(12)).map((reason) => reason.code)).toEqual([
      'ABSENCE_PENDING',
    ]);
    expect(
      reasonsFor(reasons, 'b', day(13))
        .map((reason) => reason.code)
        .sort(),
    ).toEqual(['QUALIFICATION', 'UNAVAILABLE']);
    expect(eligibilityStatus(reasonsFor(reasons, 'a', day(12)))).toBe('WARNING');
    expect(eligibilityStatus(reasonsFor(reasons, 'b', day(13)))).toBe('BLOCKED');
  });
});
