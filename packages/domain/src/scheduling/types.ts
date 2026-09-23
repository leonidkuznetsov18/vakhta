/** Графік (ТЗ 3): версії, призначення, життєвий цикл. */

export const SCHEDULE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'CLOSED',
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_ACTIONS = ['SUBMIT', 'RETURN', 'PUBLISH', 'SUPERSEDE', 'CLOSE'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

export const SHIFT_KINDS = ['REGULAR', 'EXTRA', 'REPLACEMENT', 'SWAP'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

/** Part of the day a shift template covers; drives its colour and its name for workers. */
export const ShiftPeriod = { DAY: 'DAY', NIGHT: 'NIGHT', FULL_DAY: 'FULL_DAY' } as const;
export type ShiftPeriod = (typeof ShiftPeriod)[keyof typeof ShiftPeriod];
export const SHIFT_PERIODS = [ShiftPeriod.DAY, ShiftPeriod.NIGHT, ShiftPeriod.FULL_DAY] as const;

export const ASSIGNMENT_STATUSES = ['PLANNED', 'CANCELLED', 'REPLACED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Worker-facing shift reminders must not disturb employees earlier than this window. */
export const SHIFT_REMINDER_LEAD_MINUTES = 30;

/** Мінімум, який потрібен правилам валідації і календарю. */
export interface PlannedShift {
  readonly id: string;
  readonly employeeId: string;
  /** 'YYYY-MM-DD', ділова дата = локальна дата початку (ADR-5). */
  readonly businessDate: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly period: ShiftPeriod;
  readonly templateCode: string;
  readonly zoneId: string | null;
  /** Older callers omit metadata; publication equivalence uses REGULAR/null defaults. */
  readonly kind?: ShiftKind;
  readonly teamId?: string | null;
  readonly positionId?: string | null;
}

/** Життєвий цикл версії за ТЗ 3.1. null означає, що перехід заборонений. */
export function nextScheduleStatus(
  status: ScheduleStatus,
  action: ScheduleAction,
): ScheduleStatus | null {
  switch (action) {
    case 'SUBMIT':
      return status === 'DRAFT' ? 'IN_REVIEW' : null;
    case 'RETURN':
      return status === 'IN_REVIEW' ? 'DRAFT' : null;
    case 'PUBLISH':
      return status === 'IN_REVIEW' ? 'PUBLISHED' : null;
    case 'SUPERSEDE':
      return status === 'PUBLISHED' ? 'SUPERSEDED' : null;
    case 'CLOSE':
      return status === 'PUBLISHED' ? 'CLOSED' : null;
  }
}

export function shiftMinutes(shift: Pick<PlannedShift, 'planStartAt' | 'planEndAt'>): number {
  return Math.round((shift.planEndAt.getTime() - shift.planStartAt.getTime()) / 60_000);
}
