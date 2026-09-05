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
