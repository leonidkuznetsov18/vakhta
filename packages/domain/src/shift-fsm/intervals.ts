import type { ShiftSnapshot } from './machine.js';
import { isActive, type ResumableState, type ShiftState } from './states.js';

/** Інтервал стану в мілісекундах epoch. Дзеркало activity_intervals без ідентифікаторів. */
export interface ActivityInterval {
  readonly state: ShiftState;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly resumeState: ResumableState | null;
}

/**
 * Закриває відкритий інтервал і відкриває новий для активного стану.
 * Для термінального стану новий інтервал не відкривається.
 */
export function applyTransitionToIntervals(
  intervals: readonly ActivityInterval[],
  next: ShiftSnapshot,
  at: number,
): ActivityInterval[] {
  const closed = intervals.map((i) => (i.endedAt === null ? { ...i, endedAt: at } : i));
  if (!isActive(next.state)) return closed;
  return [
    ...closed,
    { state: next.state, startedAt: at, endedAt: null, resumeState: next.resumeState },
  ];
}

export type IntervalViolationCode =
  | 'NEGATIVE_LENGTH'
  | 'MULTIPLE_OPEN'
  | 'OPEN_NOT_LAST'
  | 'OVERLAP'
  | 'GAP'
  | 'START_MISMATCH'
  | 'OPEN_AFTER_END'
  | 'SUM_MISMATCH';

export interface IntervalViolation {
  readonly code: IntervalViolationCode;
  readonly detail: string;
}

export interface IntervalCheckOptions {
  readonly shiftStartedAt: number;
  /** null, поки зміна відкрита. */
  readonly shiftEndedAt: number | null;
  /** Поточний момент; потрібен, щоб порахувати відкритий інтервал. */
  readonly now: number;
  /** Технічна похибка, ТЗ 6.1: не більше 1 секунди. */
  readonly toleranceMs?: number;
}

/**
 * Інваріанти ТЗ 4.5 і 6.1: інтервали не перетинаються, не мають розривів,
 * відкритий не більше одного і лише останній, сума дорівнює тривалості зміни.
 */
export function checkIntervalInvariants(
  intervals: readonly ActivityInterval[],
  opts: IntervalCheckOptions,
): IntervalViolation[] {
  const tol = opts.toleranceMs ?? 1000;
  const violations: IntervalViolation[] = [];
  const sorted = [...intervals].sort((a, b) => a.startedAt - b.startedAt);

  const open = sorted.filter((i) => i.endedAt === null);
  if (open.length > 1) {
    violations.push({ code: 'MULTIPLE_OPEN', detail: `${open.length} відкритих інтервалів` });
  }
  if (open.length === 1 && sorted[sorted.length - 1]?.endedAt !== null) {
    violations.push({ code: 'OPEN_NOT_LAST', detail: 'відкритий інтервал не останній' });
  }
  if (open.length > 0 && opts.shiftEndedAt !== null) {
    violations.push({ code: 'OPEN_AFTER_END', detail: 'зміна закрита, але інтервал відкритий' });
  }

  const first = sorted[0];
  if (first && Math.abs(first.startedAt - opts.shiftStartedAt) > tol) {
    violations.push({
      code: 'START_MISMATCH',
      detail: `перший інтервал ${first.startedAt} ≠ початок зміни ${opts.shiftStartedAt}`,
    });
  }

  let sum = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const end = cur.endedAt ?? opts.now;
    if (end < cur.startedAt) {
      violations.push({ code: 'NEGATIVE_LENGTH', detail: `${cur.state} @${cur.startedAt}` });
    }
    sum += Math.max(0, end - cur.startedAt);

    const next = sorted[i + 1];
    if (next && cur.endedAt !== null) {
      const delta = next.startedAt - cur.endedAt;
      if (delta < -tol) {
        violations.push({ code: 'OVERLAP', detail: `${cur.state} → ${next.state}: ${-delta} мс` });
      } else if (delta > tol) {
        violations.push({ code: 'GAP', detail: `${cur.state} → ${next.state}: ${delta} мс` });
      }
    }
  }

  const expected = (opts.shiftEndedAt ?? opts.now) - opts.shiftStartedAt;
  if (sorted.length > 0 && Math.abs(sum - expected) > tol) {
    violations.push({ code: 'SUM_MISMATCH', detail: `сума ${sum} ≠ тривалість ${expected}` });
  }

  return violations;
}

/** Сума тривалостей за станом у мілісекундах. Відкритий інтервал рахується до `now`. */
export function sumByState(
  intervals: readonly ActivityInterval[],
  now: number,
): Partial<Record<ShiftState, number>> {
  const out: Partial<Record<ShiftState, number>> = {};
  for (const i of intervals) {
    const end = i.endedAt ?? now;
    out[i.state] = (out[i.state] ?? 0) + Math.max(0, end - i.startedAt);
  }
  return out;
}
