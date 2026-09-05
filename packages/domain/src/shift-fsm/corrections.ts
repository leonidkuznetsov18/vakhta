import {
  checkIntervalInvariants,
  type ActivityInterval,
  type IntervalViolation,
} from './intervals.js';
import type { ShiftState } from './states.js';

/** Інтервал з ідентифікатором для корекцій. */
export interface IdentifiedInterval extends ActivityInterval {
  readonly id: string;
}

/**
 * Пропозиція корекції (FR-COR-03): змістити межу між сусідніми інтервалами або перекласифікувати
 * інтервал. Час лишається неперервним: сусіди підлаштовуються автоматично.
 */
export type CorrectionProposal =
  | { readonly kind: 'MOVE_BOUNDARY'; readonly intervalId: string; readonly newStartedAt: number }
  | { readonly kind: 'RECLASSIFY'; readonly intervalId: string; readonly newState: ShiftState }
  | { readonly kind: 'CLOSE_SHIFT_AT'; readonly endedAt: number };

export interface CorrectionResult {
  readonly ok: boolean;
  readonly intervals: IdentifiedInterval[];
  readonly violations: IntervalViolation[];
  /** Що змінилося, для payload компенсуючої події (FR-COR-04). */
  readonly changes: {
    readonly intervalId: string;
    readonly before: ActivityInterval;
    readonly after: ActivityInterval;
  }[];
}

/**
 * Застосовує пропозицію до копії інтервалів і перевіряє інваріанти ТЗ 4.5. Вихідні дані не змінюються:
 * застосунок пише компенсуючу подію й нові рядки, зберігаючи історію (FR-COR-03, T-39).
 */
export function applyCorrection(
  intervals: readonly IdentifiedInterval[],
  proposal: CorrectionProposal,
  shift: { readonly startedAt: number; readonly endedAt: number | null; readonly now: number },
): CorrectionResult {
  const sorted = [...intervals].sort((a, b) => a.startedAt - b.startedAt);
  const next = sorted.map((i) => ({ ...i }));
  const changes: CorrectionResult['changes'] = [];
  const record = (index: number, before: ActivityInterval) => {
    const after = next[index]!;
    if (
      before.startedAt !== after.startedAt ||
      before.endedAt !== after.endedAt ||
      before.state !== after.state
    ) {
      changes.push({ intervalId: after.id, before, after: { ...after } });
    }
  };

  let shiftStartedAt = shift.startedAt;
  let shiftEndedAt = shift.endedAt;

  switch (proposal.kind) {
    case 'MOVE_BOUNDARY': {
      const index = next.findIndex((i) => i.id === proposal.intervalId);
      if (index < 0)
        return {
          ok: false,
          intervals: next,
          violations: [{ code: 'GAP', detail: 'інтервал не знайдено' }],
          changes: [],
        };
      const before = { ...next[index]! };
      next[index] = { ...next[index]!, startedAt: proposal.newStartedAt };
      record(index, before);
      if (index > 0) {
        const prevBefore = { ...next[index - 1]! };
        next[index - 1] = { ...next[index - 1]!, endedAt: proposal.newStartedAt };
        record(index - 1, prevBefore);
      } else {
        shiftStartedAt = proposal.newStartedAt;
      }
      break;
    }
    case 'RECLASSIFY': {
      const index = next.findIndex((i) => i.id === proposal.intervalId);
      if (index < 0)
        return {
          ok: false,
          intervals: next,
          violations: [{ code: 'GAP', detail: 'інтервал не знайдено' }],
          changes: [],
        };
      const before = { ...next[index]! };
      next[index] = { ...next[index]!, state: proposal.newState };
      record(index, before);
      break;
    }
    case 'CLOSE_SHIFT_AT': {
      const last = next.length - 1;
      if (last < 0)
        return {
          ok: false,
          intervals: next,
          violations: [{ code: 'GAP', detail: 'немає інтервалів' }],
          changes: [],
        };
      const before = { ...next[last]! };
      next[last] = { ...next[last]!, endedAt: proposal.endedAt };
      record(last, before);
      shiftEndedAt = proposal.endedAt;
      break;
    }
  }

  const violations = checkIntervalInvariants(next, {
    shiftStartedAt,
    shiftEndedAt,
    now: shift.now,
  }).filter((v) => v.code !== 'OPEN_AFTER_END' || proposal.kind !== 'CLOSE_SHIFT_AT');
  return { ok: violations.length === 0, intervals: next, violations, changes };
}
