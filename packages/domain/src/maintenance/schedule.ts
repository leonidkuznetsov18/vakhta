import { DateTime } from 'luxon';
import { AnchorMode, IntervalUnit, WorkStatus, isOpenWork } from './codes.js';

/** The recurring rule of a plan version; dates are site-local business dates 'YYYY-MM-DD'. */
export interface PlanRule {
  readonly intervalUnit: IntervalUnit;
  readonly intervalCount: number;
  readonly anchorMode: AnchorMode;
}

/** Safety bound for grid walks: a daily plan over ten years stays well below it. */
const MAX_STEPS = 4000;

function day(date: string): DateTime {
  const parsed = DateTime.fromISO(date, { zone: 'UTC' });
  if (!parsed.isValid) throw new RangeError(`Invalid business date: "${date}"`);
  return parsed;
}

function iso(value: DateTime): string {
  return value.toISODate() as string;
}

/** Calendar months clamp to the month end: 31 January + 1 month is the last day of February. */
export function addInterval(date: string, unit: IntervalUnit, count: number): string {
  const start = day(date);
  switch (unit) {
    case IntervalUnit.DAY:
      return iso(start.plus({ days: count }));
    case IntervalUnit.WEEK:
      return iso(start.plus({ weeks: count }));
    case IntervalUnit.MONTH:
      return iso(start.plus({ months: count }));
  }
}

export function addDays(date: string, days: number): string {
  return iso(day(date).plus({ days }));
}

/** Step `k` of a grid anchored at `anchor`; counted from the anchor so month ends never drift. */
function gridDate(anchor: string, rule: PlanRule, k: number): string {
  return addInterval(anchor, rule.intervalUnit, rule.intervalCount * k);
}

export interface NextCycle {
  readonly nextDueOn: string;
  /** Fixed-calendar dates skipped by a late cycle; they stay missed, never "done on time". */
  readonly missed: readonly string[];
}

/**
 * The due date of the cycle after an accepted one (TZ-M §19). From completion counts from the
 * performed date; a fixed calendar keeps the original grid and records the dates a late cycle
 * skipped.
 */
export function nextCycle(rule: PlanRule, dueOn: string, performedOn: string): NextCycle {
  if (rule.intervalCount <= 0) throw new RangeError('Interval must be positive');
  if (rule.anchorMode === AnchorMode.FROM_COMPLETION) {
    return {
      nextDueOn: addInterval(performedOn, rule.intervalUnit, rule.intervalCount),
      missed: [],
    };
  }
  const missed: string[] = [];
  for (let k = 1; k <= MAX_STEPS; k += 1) {
    const candidate = gridDate(dueOn, rule, k);
    if (candidate > performedOn) return { nextDueOn: candidate, missed };
    missed.push(candidate);
  }
  throw new RangeError('Plan grid did not reach the performed date');
}

/** A date range [from, to] of business dates. */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Projected due dates after the open cycle inside the range, assuming each cycle is done on its
 * due date. A forecast, never a work item (FR-032).
 */
export function forecastDueDates(rule: PlanRule, openDueOn: string, range: DateRange): string[] {
  const dates: string[] = [];
  for (let k = 1; k <= MAX_STEPS; k += 1) {
    const candidate = gridDate(openDueOn, rule, k);
    if (candidate > range.to) break;
    if (candidate >= range.from) dates.push(candidate);
  }
  return dates;
}

/** Overdue once the due date has passed in the site's time zone without accepted completion. */
export function isOverdue(dueOn: string, today: string, status: WorkStatus): boolean {
  // Submitted work was done; waiting for the review does not make it late.
  return isOpenWork(status) && status !== WorkStatus.IN_REVIEW && today > dueOn;
}
