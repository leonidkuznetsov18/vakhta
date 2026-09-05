/**
 * Присутність (ТЗ 4.1, FR-QR-03..05, FR-TIME-01/05): до якої планової зміни належить
 * прихід чи відхід. Вікна налаштовуються (ТЗ 18 п. 4).
 */

export interface AttendanceWindow {
  /** За скільки хвилин до планового початку можна відмітити прихід. */
  readonly arriveBeforeMinutes: number;
  /** Скільки хвилин після планового кінця ще можна відмітити відхід. */
  readonly departAfterMinutes: number;
}

export const DEFAULT_ATTENDANCE_WINDOW: AttendanceWindow = Object.freeze({
  arriveBeforeMinutes: 180,
  departAfterMinutes: 180,
});

export interface AssignmentCandidate {
  readonly id: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
}

/**
 * Прихід прив'язується до зміни, чиє вікно [start − arriveBefore, end] містить момент.
 * Якщо підходить кілька (зміни впритул), береться та, що починається раніше і ще не скінчилась.
 * null означає FR-QR-05: підходящої зміни немає, автоматично нічого не починається.
 */
export function pickArrivalAssignment<T extends AssignmentCandidate>(
  candidates: readonly T[],
  now: Date,
  window: AttendanceWindow = DEFAULT_ATTENDANCE_WINDOW,
): T | null {
  const t = now.getTime();
  const before = window.arriveBeforeMinutes * 60_000;
  const matching = candidates
    .filter((c) => t >= c.planStartAt.getTime() - before && t <= c.planEndAt.getTime())
    .sort((a, b) => a.planStartAt.getTime() - b.planStartAt.getTime());
  return matching[0] ?? null;
}

/** Відхід можливий, поки не минуло departAfter хвилин після планового кінця. */
export function isDepartureWithinWindow(
  assignment: AssignmentCandidate | null,
  now: Date,
  window: AttendanceWindow = DEFAULT_ATTENDANCE_WINDOW,
): boolean {
  if (!assignment) return true;
  return now.getTime() <= assignment.planEndAt.getTime() + window.departAfterMinutes * 60_000;
}

export const CHECK_IN_FAILURES = [
  'CHALLENGE_INVALID',
  'CHALLENGE_EXPIRED',
  'TERMINAL_DISABLED',
  'NO_ASSIGNMENT',
  'ALREADY_ARRIVED',
  'NOT_ARRIVED',
] as const;
export type CheckInFailure = (typeof CHECK_IN_FAILURES)[number];

export type CheckAction = 'ARRIVE' | 'DEPART';
