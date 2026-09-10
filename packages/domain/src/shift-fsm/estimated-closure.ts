import type { ActivityInterval } from './intervals.js';

/** Keep interval identities and original event history while bounding an estimated accounting view. */
export function projectEstimatedClosure<T extends ActivityInterval>(
  intervals: readonly T[],
  shiftStartedAt: number,
  effectiveEndedAt: number,
): (Omit<T, 'startedAt' | 'endedAt'> & { readonly startedAt: number; readonly endedAt: number })[] {
  if (!Number.isFinite(effectiveEndedAt) || effectiveEndedAt < shiftStartedAt) {
    throw new RangeError('Estimated end must not precede the recorded shift start');
  }
  return intervals.map((interval) => ({
    ...interval,
    startedAt: Math.min(interval.startedAt, effectiveEndedAt),
    endedAt: Math.min(interval.endedAt ?? effectiveEndedAt, effectiveEndedAt),
  }));
}
