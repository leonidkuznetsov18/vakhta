import { DateTime, IANAZone } from 'luxon';

/** Шаблон зміни в локальному часі майданчика, ТЗ 3: наприклад 20:00–08:00. */
export interface ShiftTemplateLocal {
  /** 'HH:mm' */
  readonly localStart: string;
  /** 'HH:mm'; якщо не пізніше за localStart, зміна закінчується наступної доби. */
  readonly localEnd: string;
}

export interface PlanInstants {
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  /** Ділова дата зміни = локальна дата початку (ТЗ 1.5, 6.1). */
  readonly businessDate: string;
  readonly durationMinutes: number;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseLocalTime(value: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(value);
  if (!m) throw new RangeError(`Некоректний локальний час: "${value}", очікується HH:mm`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function assertValidTimezone(timezone: string): void {
  if (!IANAZone.isValidZone(timezone)) {
    throw new RangeError(`Невідомий часовий пояс IANA: "${timezone}"`);
  }
}

/**
 * Обчислює планові моменти з локального шаблону і tz майданчика.
 * Викликається один раз при публікації версії графіка (ADR-5); DST враховано тут,
 * тому нічна зміна в ніч переходу часу триває 11 або 13 годин, як і в реальності.
 */
export function planInstants(
  businessDate: string,
  template: ShiftTemplateLocal,
  timezone: string,
): PlanInstants {
  assertValidTimezone(timezone);
  const start = parseLocalTime(template.localStart);
  const end = parseLocalTime(template.localEnd);

  const day = DateTime.fromISO(businessDate, { zone: timezone });
  if (!day.isValid) throw new RangeError(`Некоректна ділова дата: "${businessDate}"`);

  const startAt = day.set({ hour: start.hour, minute: start.minute, second: 0, millisecond: 0 });
  let endAt = day.set({ hour: end.hour, minute: end.minute, second: 0, millisecond: 0 });
  if (endAt <= startAt) {
    // Календарний плюс один день зберігає локальний час 08:00 навіть через перехід DST.
    endAt = day
      .plus({ days: 1 })
      .set({ hour: end.hour, minute: end.minute, second: 0, millisecond: 0 });
  }

  return {
    planStartAt: startAt.toJSDate(),
    planEndAt: endAt.toJSDate(),
    businessDate: startAt.toISODate() as string,
    durationMinutes: Math.round(endAt.diff(startAt, 'minutes').minutes),
  };
}

export interface ShiftTemplateForInference extends ShiftTemplateLocal {
  readonly id: string;
  readonly isNight: boolean;
}

export interface InferredShift {
  readonly templateId: string;
  readonly isNight: boolean;
  readonly plan: PlanInstants;
}

/**
 * Unscheduled arrival: no published assignment, but the shift must still open from QR to QR.
 * Pick the site shift template the employee is arriving for. Candidates are every active template
 * on the arrival's business date and the day before (a night shift belongs to the day it starts).
 * The chosen one is the template whose window [start − arriveBefore, end] contains the arrival and
 * whose planned start is nearest the arrival; when none contains it, the template with the nearest
 * start overall, so a shift always opens. Returns null only when there are no templates at all.
 */
export function inferShiftFromArrival(
  templates: readonly ShiftTemplateForInference[],
  arrival: Date,
  timezone: string,
  arriveBeforeMinutes = 180,
): InferredShift | null {
  if (templates.length === 0) return null;
  const dates = [
    businessDateOf(new Date(arrival.getTime() - 24 * 3_600_000), timezone),
    businessDateOf(arrival, timezone),
  ];
  const candidates: InferredShift[] = templates.flatMap((t) =>
    dates.map((d) => ({
      templateId: t.id,
      isNight: t.isNight,
      plan: planInstants(d, t, timezone),
    })),
  );
  const t = arrival.getTime();
  const before = arriveBeforeMinutes * 60_000;
  // Nearest planned start, so a 07:30 arrival takes the day shift (start 08:00), not the night
  // shift that merely ends at 08:00. Templates whose window contains the arrival win over the rest.
  const byNearestStart = (a: InferredShift, b: InferredShift) =>
    Math.abs(t - a.plan.planStartAt.getTime()) - Math.abs(t - b.plan.planStartAt.getTime());
  const within = candidates
    .filter((c) => t >= c.plan.planStartAt.getTime() - before && t <= c.plan.planEndAt.getTime())
    .sort(byNearestStart);
  if (within[0]) return within[0];
  return [...candidates].sort(byNearestStart)[0] ?? null;
}

/** The month before the given 'YYYY-MM'; January rolls back to December of the previous year. */
export function previousMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  if (!year || !index) throw new Error(`bad month: ${month}`);
  const y = index === 1 ? year - 1 : year;
  const m = index === 1 ? 12 : index - 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

/** Локальна дата моменту в часовому поясі майданчика, 'YYYY-MM-DD'. */
export function businessDateOf(instant: Date, timezone: string): string {
  assertValidTimezone(timezone);
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate() as string;
}

/** Локальне подання моменту для інтерфейсу: 'YYYY-MM-DD HH:mm' і зміщення, ТЗ 6.1. */
export function formatLocal(instant: Date, timezone: string): { local: string; offset: string } {
  assertValidTimezone(timezone);
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  return { local: dt.toFormat('yyyy-LL-dd HH:mm'), offset: dt.toFormat('ZZ') };
}

/** Inclusive/exclusive calendar range in the site's timezone, preserving DST boundaries. */
export function calendarPeriod(
  date: string,
  unit: 'day' | 'month' | 'year',
  timezone: string,
): { from: string; to: string } {
  assertValidTimezone(timezone);
  const start = DateTime.fromISO(date, { zone: timezone }).startOf(unit);
  if (!start.isValid) throw new RangeError('Invalid calendar date');
  return {
    from: start.toUTC().toISO() as string,
    to: start
      .plus({ [unit]: 1 })
      .toUTC()
      .toISO() as string,
  };
}
