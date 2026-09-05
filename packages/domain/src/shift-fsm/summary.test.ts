import { describe, expect, it } from 'vitest';
import { computeShiftSummary } from './summary.js';
import type { ActivityInterval } from './intervals.js';

const T0 = Date.UTC(2026, 8, 7, 5, 0); // 08:00 Kyiv
const m = (n: number) => n * 60_000;
const opts = { graceMinutes: 10, earlyStartWindowMinutes: 30, overtimeThresholdMinutes: 15 };

function intervals(): ActivityInterval[] {
  return [
    { state: 'PREPARATION', startedAt: T0, endedAt: T0 + m(10), resumeState: null },
    { state: 'WORKING', startedAt: T0 + m(10), endedAt: T0 + m(240), resumeState: null },
    { state: 'MEAL', startedAt: T0 + m(240), endedAt: T0 + m(270), resumeState: 'WORKING' },
    { state: 'WORKING', startedAt: T0 + m(270), endedAt: T0 + m(600), resumeState: null },
    { state: 'DOWNTIME', startedAt: T0 + m(600), endedAt: T0 + m(630), resumeState: 'WORKING' },
    { state: 'WORKING', startedAt: T0 + m(630), endedAt: T0 + m(690), resumeState: null },
    { state: 'CLEANING', startedAt: T0 + m(690), endedAt: T0 + m(710), resumeState: null },
    { state: 'HANDOVER', startedAt: T0 + m(710), endedAt: T0 + m(720), resumeState: null },
    { state: 'READY_TO_CLOSE', startedAt: T0 + m(720), endedAt: null, resumeState: null },
  ];
}

describe('computeShiftSummary (ТЗ 6.2)', () => {
  it('розкладає час за категоріями, сума дорівнює тривалості', () => {
    const s = computeShiftSummary(
      intervals(),
      new Date(T0),
      new Date(T0 + m(725)),
      { planStartAt: new Date(T0), planEndAt: new Date(T0 + m(720)) },
      opts,
    );
    expect(s.totalMinutes).toBe(725);
    expect(s.preparationMinutes).toBe(10);
    expect(s.mealMinutes).toBe(30);
    expect(s.downtimeMinutes).toBe(30);
    expect(s.workMinutes).toBe(725 - 10 - 30 - 30);
    expect(s.plannedMinutes).toBe(720);
    expect(s.lateMinutes).toBe(0);
    expect(s.earlyLeaveMinutes).toBe(0);
    expect(s.overtimeMinutes).toBe(5);
    expect(s.overtimePending).toBe(false);
  });

  it('T-15/T-21: запізнення понад вікно і переробка понад поріг позначаються', () => {
    const late = computeShiftSummary(
      [{ state: 'WORKING', startedAt: T0 + m(25), endedAt: null, resumeState: null }],
      new Date(T0 + m(25)),
      new Date(T0 + m(760)),
      { planStartAt: new Date(T0), planEndAt: new Date(T0 + m(720)) },
      opts,
    );
    expect(late.lateMinutes).toBe(15);
    expect(late.overtimeMinutes).toBe(40);
    expect(late.overtimePending).toBe(true);
    const early = computeShiftSummary(
      [{ state: 'WORKING', startedAt: T0, endedAt: null, resumeState: null }],
      new Date(T0),
      new Date(T0 + m(600)),
      { planStartAt: new Date(T0), planEndAt: new Date(T0 + m(720)) },
      opts,
    );
    expect(early.earlyLeaveMinutes).toBe(110);
  });

  it('без плану відхилення нульові, а план невідомий', () => {
    const s = computeShiftSummary([], new Date(T0), new Date(T0 + m(60)), null, opts);
    expect(s).toMatchObject({
      plannedMinutes: null,
      lateMinutes: 0,
      overtimeMinutes: 0,
      totalMinutes: 60,
    });
  });
});
