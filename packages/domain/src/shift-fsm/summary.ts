import { earlyLeaveMinutes, lateMinutes, overtimePending } from '../time/deviations.js';
import type { ActivityInterval } from './intervals.js';
import { STATE_TIME_CATEGORY, type TimeCategory } from './states.js';

export interface ShiftPlan {
  readonly planStartAt: Date;
  readonly planEndAt: Date;
}

export interface SummaryOptions {
  /** Пільгове вікно для запізнення і раннього відходу (ТЗ 18, п. 4). */
  readonly graceMinutes: number;
  /** На скільки хвилин раніше плану можна почати без потенційної переробки. */
  readonly earlyStartWindowMinutes: number;
  /** Від скількох хвилин понад план переробка потребує рішення керівника (FR-TIME-06). */
  readonly overtimeThresholdMinutes?: number;
}

/** Підсумок зміни у хвилинах (ТЗ 6.2, shift_summaries). Усі значення цілі й невідʼємні. */
export interface ShiftSummary {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly totalMinutes: number;
  readonly workMinutes: number;
  readonly preparationMinutes: number;
  readonly serviceMinutes: number;
  readonly breakMinutes: number;
  readonly mealMinutes: number;
  readonly downtimeMinutes: number;
  readonly plannedMinutes: number | null;
  readonly lateMinutes: number;
  readonly earlyLeaveMinutes: number;
  readonly overtimeMinutes: number;
  readonly overtimePending: boolean;
}

type Category = Exclude<TimeCategory, 'NONE'>;

function minutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000));
}

/**
 * Рахує підсумок із інтервалів закритої зміни. Відкритий інтервал (якщо є) рахується до endedAt,
 * тож функцію можна викликати і для «поточного стану» під час зміни.
 */
export function computeShiftSummary(
  intervals: readonly ActivityInterval[],
  startedAt: Date,
  endedAt: Date,
  plan: ShiftPlan | null,
  opts: SummaryOptions,
): ShiftSummary {
  const acc: Record<Category, number> = {
    WORK: 0,
    PREPARATION: 0,
    SERVICE: 0,
    BREAK: 0,
    MEAL: 0,
    DOWNTIME: 0,
  };
  for (const i of intervals) {
    const category = STATE_TIME_CATEGORY[i.state];
    if (category === 'NONE') continue;
    const end = i.endedAt ?? endedAt.getTime();
    acc[category] += Math.max(0, end - i.startedAt);
  }

  const late = plan ? Math.round(lateMinutes(startedAt, plan.planStartAt, opts.graceMinutes)) : 0;
  const early = plan
    ? Math.round(earlyLeaveMinutes(endedAt, plan.planEndAt, opts.graceMinutes))
    : 0;
  const overtime = plan
    ? Math.round(
        overtimePending({
          actualStartAt: startedAt,
          actualEndAt: endedAt,
          planStartAt: plan.planStartAt,
          planEndAt: plan.planEndAt,
          earlyStartWindowMinutes: opts.earlyStartWindowMinutes,
        }).totalMinutes,
      )
    : 0;

  return {
    startedAt,
    endedAt,
    totalMinutes: minutes(endedAt.getTime() - startedAt.getTime()),
    workMinutes: minutes(acc.WORK),
    preparationMinutes: minutes(acc.PREPARATION),
    serviceMinutes: minutes(acc.SERVICE),
    breakMinutes: minutes(acc.BREAK),
    mealMinutes: minutes(acc.MEAL),
    downtimeMinutes: minutes(acc.DOWNTIME),
    plannedMinutes: plan ? minutes(plan.planEndAt.getTime() - plan.planStartAt.getTime()) : null,
    lateMinutes: late,
    earlyLeaveMinutes: early,
    overtimeMinutes: overtime,
    overtimePending: overtime > (opts.overtimeThresholdMinutes ?? 0),
  };
}
