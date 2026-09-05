/**
 * Відхилення факту від плану, ТЗ 6.1. Усі функції чисті і працюють з моментами UTC.
 * Пільгові вікна є параметрами (ТЗ 18, п. 4) і не зашиті в код.
 */

const MS_PER_MINUTE = 60_000;

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_MINUTE;
}

/** Тривалість зміни у хвилинах: server_end_at − server_start_at. */
export function shiftDurationMinutes(actualStartAt: Date, actualEndAt: Date): number {
  return Math.max(0, minutesBetween(actualStartAt, actualEndAt));
}

/**
 * Запізнення = max(0, фактичний початок − допустимий плановий початок),
 * де допустимий = план + пільгове вікно. У межах вікна запізнення немає (T-15).
 */
export function lateMinutes(actualStartAt: Date, planStartAt: Date, graceMinutes: number): number {
  return Math.max(0, minutesBetween(planStartAt, actualStartAt) - graceMinutes);
}

/** Ранній відхід = max(0, допустиме планове закінчення − фактичне закінчення). */
export function earlyLeaveMinutes(
  actualEndAt: Date,
  planEndAt: Date,
  graceMinutes: number,
): number {
  return Math.max(0, minutesBetween(actualEndAt, planEndAt) - graceMinutes);
}

export interface OvertimeInput {
  readonly actualStartAt: Date;
  readonly actualEndAt: Date;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  /** На скільки хвилин раніше плану дозволено почати без потенційної переробки. */
  readonly earlyStartWindowMinutes: number;
}

export interface OvertimePending {
  readonly beforeMinutes: number;
  readonly afterMinutes: number;
  readonly totalMinutes: number;
}

/**
 * Час до дозволеного вікна і після плану позначається overtime_pending (FR-TIME-06, T-21).
 * Він не стає погодженою переробкою без рішення керівника.
 */
export function overtimePending(input: OvertimeInput): OvertimePending {
  const allowedStart = new Date(
    input.planStartAt.getTime() - input.earlyStartWindowMinutes * MS_PER_MINUTE,
  );
  const beforeMinutes = Math.max(0, minutesBetween(input.actualStartAt, allowedStart));
  const afterMinutes = Math.max(0, minutesBetween(input.planEndAt, input.actualEndAt));
  return { beforeMinutes, afterMinutes, totalMinutes: beforeMinutes + afterMinutes };
}
