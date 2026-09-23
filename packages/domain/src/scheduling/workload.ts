import { ShiftPeriod } from './types.js';

/**
 * Planned workload distribution (SC-35): planned shifts, nights, weekends, hours and breaks per
 * worker over an explicit period and cohort. Hours belong to the business date of the shift; the
 * result compares against the cohort average and never states a fairness verdict. Planned hours
 * only: actual attendance keeps its own evidence and units.
 */

export interface WorkloadAssignment {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly period: ShiftPeriod;
  /** Planned break minutes inside the shift; excluded from planned working minutes. */
  readonly breakMinutes?: number | undefined;
}

export interface WorkloadRow {
  readonly employeeId: string;
  readonly shifts: number;
  readonly nightShifts: number;
  readonly fullDayShifts: number;
  readonly weekendShifts: number;
  /** Planned working minutes with planned breaks subtracted. */
  readonly plannedMinutes: number;
  readonly breakMinutes: number;
  /** Difference from the cohort average of planned minutes (negative below average). */
  readonly deltaMinutes: number;
}

export interface WorkloadSummary {
  readonly rows: WorkloadRow[];
  readonly cohortSize: number;
  readonly averageMinutes: number;
  readonly averageShifts: number;
  readonly dates: readonly string[];
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function workload(input: {
  readonly assignments: readonly WorkloadAssignment[];
  readonly dates: readonly string[];
  /** Explicit cohort: every listed worker appears, with zero when unplanned. */
  readonly cohort: readonly string[];
}): WorkloadSummary {
  const dates = new Set(input.dates);
  const cohort = [...new Set(input.cohort)];
  const totals = new Map(
    cohort.map((employeeId) => [
      employeeId,
      {
        shifts: 0,
        nightShifts: 0,
        fullDayShifts: 0,
        weekendShifts: 0,
        plannedMinutes: 0,
        breakMinutes: 0,
      },
    ]),
  );
  for (const item of input.assignments) {
    const total = totals.get(item.employeeId);
    if (!total || !dates.has(item.businessDate)) continue;
    const minutes = Math.max(0, Math.round((item.endMs - item.startMs) / 60000));
    const breakMinutes = Math.min(minutes, Math.max(0, Math.round(item.breakMinutes ?? 0)));
    total.shifts += 1;
    if (item.period === ShiftPeriod.NIGHT) total.nightShifts += 1;
    if (item.period === ShiftPeriod.FULL_DAY) total.fullDayShifts += 1;
    if (isWeekend(item.businessDate)) total.weekendShifts += 1;
    total.plannedMinutes += minutes - breakMinutes;
    total.breakMinutes += breakMinutes;
  }
  const rows = [...totals.entries()];
  const averageMinutes =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((sum, [, total]) => sum + total.plannedMinutes, 0) / rows.length);
  const averageShifts =
    rows.length === 0
      ? 0
      : Math.round((rows.reduce((sum, [, total]) => sum + total.shifts, 0) / rows.length) * 10) /
        10;
  return {
    rows: rows.map(([employeeId, total]) => ({
      employeeId,
      ...total,
      deltaMinutes: total.plannedMinutes - averageMinutes,
    })),
    cohortSize: rows.length,
    averageMinutes,
    averageShifts,
    dates: [...input.dates],
  };
}
