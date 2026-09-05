import { describe, expect, it } from 'vitest';
import { applyCorrection, type IdentifiedInterval } from './corrections.js';

const T0 = Date.UTC(2026, 8, 7, 5, 0);
const m = (n: number) => T0 + n * 60_000;
const intervals: IdentifiedInterval[] = [
  { id: 'a', state: 'PREPARATION', startedAt: m(0), endedAt: m(10), resumeState: null },
  { id: 'b', state: 'WORKING', startedAt: m(10), endedAt: m(300), resumeState: null },
  { id: 'c', state: 'BREAK', startedAt: m(300), endedAt: m(340), resumeState: 'WORKING' },
  { id: 'd', state: 'WORKING', startedAt: m(340), endedAt: null, resumeState: null },
];

describe('корекції інтервалів (FR-COR-03, T-39)', () => {
  it('зсув межі підлаштовує сусіда, історія фіксує до/після, інваріанти дотримані', () => {
    const r = applyCorrection(
      intervals,
      { kind: 'MOVE_BOUNDARY', intervalId: 'c', newStartedAt: m(290) },
      { startedAt: m(0), endedAt: null, now: m(400) },
    );
    expect(r.ok).toBe(true);
    expect(r.intervals.find((i) => i.id === 'b')?.endedAt).toBe(m(290));
    expect(r.intervals.find((i) => i.id === 'c')?.startedAt).toBe(m(290));
    expect(r.changes.map((c) => c.intervalId).sort()).toEqual(['b', 'c']);
    expect(intervals[1]!.endedAt).toBe(m(300));
  });

  it('зсув за межі сусіда дає порушення і не застосовується', () => {
    const r = applyCorrection(
      intervals,
      { kind: 'MOVE_BOUNDARY', intervalId: 'c', newStartedAt: m(5) },
      { startedAt: m(0), endedAt: null, now: m(400) },
    );
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('NEGATIVE_LENGTH');
  });

  it('перекласифікація і закриття забутої зміни', () => {
    const re = applyCorrection(
      intervals,
      { kind: 'RECLASSIFY', intervalId: 'c', newState: 'MEAL' },
      { startedAt: m(0), endedAt: null, now: m(400) },
    );
    expect(re.ok).toBe(true);
    expect(re.intervals[2]?.state).toBe('MEAL');
    const closed = applyCorrection(
      intervals,
      { kind: 'CLOSE_SHIFT_AT', endedAt: m(720) },
      { startedAt: m(0), endedAt: null, now: m(900) },
    );
    expect(closed.ok).toBe(true);
    expect(closed.intervals[3]?.endedAt).toBe(m(720));
  });
});
