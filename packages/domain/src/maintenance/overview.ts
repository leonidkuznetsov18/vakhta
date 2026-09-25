import { WorkPriority, WorkStatus, WorkType, isOpenWork } from './codes.js';
import { addDays, isOverdue } from './schedule.js';

/** Where an open work order stands on the Overview page; one bucket per work. */
export const OverviewWorkBucket = {
  EMERGENCY: 'EMERGENCY',
  OVERDUE: 'OVERDUE',
  REVIEW: 'REVIEW',
  TODAY: 'TODAY',
  UPCOMING: 'UPCOMING',
} as const;
export type OverviewWorkBucket = (typeof OverviewWorkBucket)[keyof typeof OverviewWorkBucket];
export const OVERVIEW_WORK_BUCKETS = [
  OverviewWorkBucket.EMERGENCY,
  OverviewWorkBucket.OVERDUE,
  OverviewWorkBucket.REVIEW,
  OverviewWorkBucket.TODAY,
  OverviewWorkBucket.UPCOMING,
] as const;

/** Default horizon of "approaching" maintenance when no reminder days are configured. */
export const UPCOMING_MAINTENANCE_DAYS = 7;

export interface OverviewWorkFacts {
  readonly type: WorkType;
  readonly status: WorkStatus;
  readonly dueOn: string | null;
  readonly plannedOn: string | null;
}

/**
 * The Overview bucket of a work order, or null when it is closed or planned beyond the horizon.
 * `today` is the business date in the machine's site time zone.
 */
export function overviewWorkBucket(
  work: OverviewWorkFacts,
  today: string,
  horizonDays: number,
): OverviewWorkBucket | null {
  if (!isOpenWork(work.status)) return null;
  if (work.type === WorkType.EMERGENCY_REPAIR) return OverviewWorkBucket.EMERGENCY;
  if (work.status === WorkStatus.IN_REVIEW) return OverviewWorkBucket.REVIEW;
  if (work.dueOn && isOverdue(work.dueOn, today, work.status)) return OverviewWorkBucket.OVERDUE;
  if (!work.plannedOn) return null;
  if (work.plannedOn <= today) return OverviewWorkBucket.TODAY;
  if (work.plannedOn <= addDays(today, horizonDays)) return OverviewWorkBucket.UPCOMING;
  return null;
}

/** "Approaching" is the tenant's first reminder horizon (spec 014 FR-040); plans may set their own days. */
export function upcomingHorizonDays(reminderOffsets: readonly number[]): number {
  return reminderOffsets.length ? Math.max(...reminderOffsets) : UPCOMING_MAINTENANCE_DAYS;
}

export interface EmergencyUrgencyFacts {
  readonly priority: WorkPriority;
  readonly acceptedAt: string | null;
  readonly ackDueAt: string | null;
  readonly escalatedAt: string | null;
}

/** An emergency is critical for the shift: danger or a stop, an escalation, or a missed acceptance. */
export function emergencyIsCritical(work: EmergencyUrgencyFacts, now: Date): boolean {
  if (work.priority === WorkPriority.P0 || work.priority === WorkPriority.P1) return true;
  if (work.escalatedAt) return true;
  if (work.acceptedAt || !work.ackDueAt) return false;
  return new Date(work.ackDueAt).getTime() <= now.getTime();
}
