import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkIntervalInvariants, type ActivityInterval } from './intervals.js';
import { projectEstimatedClosure } from './estimated-closure.js';

describe('estimated closure accounting projection', () => {
  it('preserves identity and continuity for any ordered history and cutoff, without mutating history', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 60000 }), { minLength: 1, maxLength: 50 }),
        fc.nat(),
        (durations, seed) => {
          let time = 0;
          const intervals = durations.map((duration, index) => {
            const startedAt = time;
            time += duration;
            return {
              id: String(index),
              state: 'WORKING',
              startedAt,
              endedAt: index === durations.length - 1 ? null : time,
              resumeState: null,
            } satisfies ActivityInterval & { id: string };
          });
          const before = structuredClone(intervals);
          const end = seed % (time + 1);
          const projected = projectEstimatedClosure(intervals, 0, end);
          expect(
            checkIntervalInvariants(projected, { shiftStartedAt: 0, shiftEndedAt: end, now: time }),
          ).toEqual([]);
          expect(projected.map((interval) => interval.id)).toEqual(
            intervals.map((interval) => interval.id),
          );
          expect(intervals).toEqual(before);
          expect(projectEstimatedClosure(projected, 0, end)).toEqual(projected);
        },
      ),
    );
  });
  it('clips crossing intervals and keeps later intervals as ordered zero-length metadata placeholders', () => {
    const input = [
      {
        id: 'work',
        state: 'WORKING',
        startedAt: 0,
        endedAt: 120,
        resumeState: null,
        reasonCode: null,
      },
      {
        id: 'pause',
        state: 'BREAK',
        startedAt: 120,
        endedAt: 150,
        resumeState: 'WORKING',
        reasonCode: 'PERSONAL',
      },
      {
        id: 'resume',
        state: 'WORKING',
        startedAt: 150,
        endedAt: null,
        resumeState: null,
        reasonCode: null,
      },
    ] as const;
    expect(projectEstimatedClosure(input, 0, 100)).toEqual([
      { ...input[0], endedAt: 100 },
      { ...input[1], startedAt: 100, endedAt: 100 },
      { ...input[2], startedAt: 100, endedAt: 100 },
    ]);
  });
  it('rejects an estimated end before the recorded start', () => {
    expect(() => projectEstimatedClosure([], 100, 99)).toThrow(RangeError);
  });
});
