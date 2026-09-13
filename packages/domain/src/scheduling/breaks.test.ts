import { describe, expect, it } from 'vitest';
import { coveredBreaks, reliefChecks, resolveBreaks } from './breaks.js';
import { coverage } from './coverage.js';
import { evaluatePlan, DEFAULT_SCHEDULING_RULES } from './eligibility.js';
import { workload } from './workload.js';

const TZ = 'Europe/Kyiv';
const day = {
  planStartAt: new Date('2026-09-07T05:00:00Z'),
  planEndAt: new Date('2026-09-07T17:00:00Z'),
  businessDate: '2026-09-07',
};
const night = {
  planStartAt: new Date('2026-09-07T17:00:00Z'),
  planEndAt: new Date('2026-09-08T05:00:00Z'),
  businessDate: '2026-09-07',
};

describe('planned breaks', () => {
  it('resolves ordered breaks inside the shift, overnight ones on the next day', () => {
    const result = resolveBreaks(
      night,
      [
        { localStart: '23:30', localEnd: '00:00' },
        { localStart: '03:00', localEnd: '03:30' },
      ],
      TZ,
    );
    expect('breaks' in result && result.breaks.map((b) => b.startAt.toISOString())).toEqual([
      '2026-09-07T20:30:00.000Z',
      '2026-09-08T00:00:00.000Z',
    ]);
    // Equal local times mean a full day for the shared instant planner; it leaves the shift.
    expect(resolveBreaks(day, [{ localStart: '12:00', localEnd: '12:00' }], TZ)).toEqual({
      error: 'BREAK_BOUNDS',
      position: 0,
    });
    expect(resolveBreaks(day, [{ localStart: '19:30', localEnd: '20:30' }], TZ)).toEqual({
      error: 'BREAK_BOUNDS',
      position: 0,
    });
    expect(
      resolveBreaks(
        day,
        [
          { localStart: '12:00', localEnd: '13:00' },
          { localStart: '12:30', localEnd: '13:30' },
        ],
        TZ,
      ),
    ).toEqual({ error: 'BREAK_OVERLAP', position: 1 });
  });

  it('validates relief: planned over the break, free of own breaks and never doubled', () => {
    const b = (startMs: number, endMs: number, reliefEmployeeId?: string) => ({
      startMs,
      endMs,
      reliefEmployeeId,
    });
    const anna = { employeeId: 'anna', businessDate: '2026-09-07', startMs: 0, endMs: 720 };
    const boris = { employeeId: 'boris', businessDate: '2026-09-07', startMs: 0, endMs: 720 };
    const clara = { employeeId: 'clara', businessDate: '2026-09-07', startMs: 300, endMs: 720 };
    expect(
      reliefChecks([{ ...anna, breaks: [b(240, 270, 'anna')] }]).map((p) => p.problem),
    ).toEqual(['RELIEF_SELF']);
    expect(
      reliefChecks([{ ...anna, breaks: [b(240, 270, 'clara')] }, clara]).map((p) => p.problem),
    ).toEqual(['RELIEF_ABSENT']);
    expect(
      reliefChecks([
        { ...anna, breaks: [b(240, 270, 'boris')] },
        { ...boris, breaks: [b(250, 280)] },
      ]).map((p) => p.problem),
    ).toEqual(['RELIEF_BUSY']);
    const doubled = reliefChecks([
      { ...anna, breaks: [b(240, 270, 'clara')] },
      { ...boris, breaks: [b(250, 280, 'clara')] },
      { ...clara, startMs: 0 },
    ]);
    expect(doubled.map((p) => [p.employeeId, p.problem])).toEqual([
      ['anna', 'RELIEF_BUSY'],
      ['boris', 'RELIEF_BUSY'],
    ]);
    const ok = { ...anna, breaks: [b(240, 270, 'boris'), b(480, 510)] };
    expect(reliefChecks([ok, boris])).toEqual([]);
    expect(coveredBreaks(ok, [ok, boris])).toEqual([true, false]);
    // The same problem surfaces through the plan evaluation as a blocking reason.
    const reasons = evaluatePlan({
      proposed: [{ ...anna, breaks: [b(240, 270, 'boris')] }],
      context: [],
      absences: [],
      preferences: [],
      rules: DEFAULT_SCHEDULING_RULES,
      staffing: { requirements: [], holdings: [] },
      month: '2026-09',
    });
    expect(reasons).toEqual([
      expect.objectContaining({
        code: 'RELIEF',
        severity: 'BLOCK',
        employeeId: 'anna',
        detail: { position: 0, reliefEmployeeId: 'boris', problem: 'RELIEF_ABSENT' },
      }),
    ]);
  });

  it('removes cover during an unrelieved break and keeps it with valid relief', () => {
    const rules = [
      {
        id: 'r1',
        zoneId: 'z',
        templateId: 'day',
        requiredCount: 1,
        qualificationId: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
    ];
    const interval = () => ({
      zoneId: 'z',
      templateId: 'day',
      businessDate: '2026-09-07',
      startMs: 0,
      endMs: 720,
    });
    const anna = {
      employeeId: 'anna',
      businessDate: '2026-09-07',
      templateId: 'day',
      zoneId: 'z',
      startMs: 0,
      endMs: 720,
    };
    const boris = { ...anna, employeeId: 'boris', zoneId: 'other' };
    const unrelieved = coverage({
      rules,
      holdings: [],
      assignments: [{ ...anna, breaks: [{ startMs: 240, endMs: 270 }] }],
      dates: ['2026-09-07'],
      zoneIds: ['z'],
      interval,
    });
    expect(unrelieved[0]).toMatchObject({ eligible: 0, missing: 1, onBreak: 1, status: 'SHORT' });
    const relieved = coverage({
      rules,
      holdings: [],
      assignments: [
        { ...anna, breaks: [{ startMs: 240, endMs: 270, reliefEmployeeId: 'boris' }] },
        boris,
      ],
      dates: ['2026-09-07'],
      zoneIds: ['z'],
      interval,
    });
    expect(relieved[0]).toMatchObject({ eligible: 1, missing: 0, onBreak: 0, status: 'COVERED' });
  });

  it('totals planned workload per explicit cohort and period without a verdict', () => {
    const result = workload({
      dates: ['2026-09-05', '2026-09-06', '2026-09-07'],
      cohort: ['anna', 'boris', 'clara'],
      assignments: [
        {
          employeeId: 'anna',
          businessDate: '2026-09-05',
          startMs: 0,
          endMs: 720 * 60000,
          isNight: false,
          breakMinutes: 30,
        },
        {
          employeeId: 'anna',
          businessDate: '2026-09-07',
          startMs: 0,
          endMs: 720 * 60000,
          isNight: true,
        },
        {
          employeeId: 'boris',
          businessDate: '2026-09-06',
          startMs: 0,
          endMs: 720 * 60000,
          isNight: false,
        },
        {
          employeeId: 'boris',
          businessDate: '2026-09-30',
          startMs: 0,
          endMs: 720 * 60000,
          isNight: false,
        },
        {
          employeeId: 'dmitro',
          businessDate: '2026-09-06',
          startMs: 0,
          endMs: 720 * 60000,
          isNight: false,
        },
      ],
    });
    expect(result.cohortSize).toBe(3);
    expect(result.averageMinutes).toBe(Math.round((1410 + 720 + 0) / 3));
    expect(result.rows).toEqual([
      expect.objectContaining({
        employeeId: 'anna',
        shifts: 2,
        nightShifts: 1,
        weekendShifts: 1,
        plannedMinutes: 1410,
        breakMinutes: 30,
        deltaMinutes: 1410 - 710,
      }),
      expect.objectContaining({
        employeeId: 'boris',
        shifts: 1,
        weekendShifts: 1,
        plannedMinutes: 720,
      }),
      expect.objectContaining({
        employeeId: 'clara',
        shifts: 0,
        plannedMinutes: 0,
        deltaMinutes: -710,
      }),
    ]);
  });
});
