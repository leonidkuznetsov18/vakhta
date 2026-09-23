import { ShiftPeriod, shiftMinutes, type PlannedShift } from './types.js';

/** A day of «My plan»: the period of its shift, or a day off. */
export type DayKind = ShiftPeriod | 'OFF';

export interface PlanDay {
  readonly date: string;
  /** 1 = понеділок … 7 = неділя. */
  readonly weekday: number;
  readonly kind: DayKind;
  readonly shift: PlannedShift | null;
}

export interface PlanTotals {
  readonly shifts: number;
  readonly plannedMinutes: number;
  readonly dayShifts: number;
  readonly nightShifts: number;
  readonly fullDayShifts: number;
}

export interface MonthPlan {
  readonly month: string;
  readonly days: readonly PlanDay[];
  readonly totals: PlanTotals;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Усі дати місяця 'YYYY-MM' у форматі 'YYYY-MM-DD'. Календарна арифметика, без часових поясів. */
export function monthDates(month: string): string[] {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`Некоректний місяць: "${month}", очікується YYYY-MM`);
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(year, monthIndex, i + 1));
    return d.toISOString().slice(0, 10);
  });
}

export function monthOf(businessDate: string): string {
  return businessDate.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`Некоректний місяць: "${month}"`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Календар місяця для «Мого плану» (FR-SCH-01): нічна зміна лежить на своїй діловій даті. */
export function buildMonthPlan(shifts: readonly PlannedShift[], month: string): MonthPlan {
  const byDate = new Map<string, PlannedShift>();
  for (const s of shifts) {
    if (monthOf(s.businessDate) === month) byDate.set(s.businessDate, s);
  }
  const days = monthDates(month).map<PlanDay>((date) => {
    const shift = byDate.get(date) ?? null;
    return {
      date,
      weekday: weekdayOf(date),
      kind: shift ? shift.period : 'OFF',
      shift,
    };
  });
  const planned = days.filter((d) => d.shift !== null);
  const count = (period: ShiftPeriod) => planned.filter((d) => d.kind === period).length;
  return {
    month,
    days,
    totals: {
      shifts: planned.length,
      plannedMinutes: planned.reduce((sum, d) => sum + shiftMinutes(d.shift!), 0),
      dayShifts: count(ShiftPeriod.DAY),
      nightShifts: count(ShiftPeriod.NIGHT),
      fullDayShifts: count(ShiftPeriod.FULL_DAY),
    },
  };
}
