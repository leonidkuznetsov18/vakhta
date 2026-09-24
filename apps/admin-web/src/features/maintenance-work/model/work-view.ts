import type { WorkDetail, WorkRow } from '@vakhta/contracts';
import {
  EquipmentState,
  FINAL_WORK_STATUSES,
  WorkStatus,
  WorkType,
  type WorkStatus as Status,
} from '@vakhta/domain';

const MINUTE_MS = 60_000;

export function isRepair(work: Pick<WorkRow, 'type'>): boolean {
  return work.type === WorkType.EMERGENCY_REPAIR;
}

export function isFinal(status: Status): boolean {
  return FINAL_WORK_STATUSES.some((final) => final === status);
}

/** Whole minutes until an instant; negative once it has passed. */
export function minutesUntil(instant: string, now: Date): number {
  return Math.ceil((Date.parse(instant) - now.getTime()) / MINUTE_MS);
}

export function minutesSince(instant: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(instant)) / MINUTE_MS));
}

export const RowStatusKind = {
  NOT_ACCEPTED: 'NOT_ACCEPTED',
  OVERDUE: 'OVERDUE',
  STATUS: 'STATUS',
} as const;

/** What the status cell of a queue row says. */
export type RowStatus =
  | { readonly kind: typeof RowStatusKind.NOT_ACCEPTED; readonly minutesLeft: number }
  | { readonly kind: typeof RowStatusKind.OVERDUE }
  | { readonly kind: typeof RowStatusKind.STATUS; readonly status: Status };

export function rowStatus(row: WorkRow, now: Date): RowStatus {
  if (isRepair(row) && !row.acceptedAt && row.ackDueAt && !isFinal(row.status))
    return { kind: RowStatusKind.NOT_ACCEPTED, minutesLeft: minutesUntil(row.ackDueAt, now) };
  if (row.overdue) return { kind: RowStatusKind.OVERDUE };
  return { kind: RowStatusKind.STATUS, status: row.status };
}

/** Repairs still open, unaccepted first: each gets a banner above the queue (FR-063). */
export function activeRepairs(rows: readonly WorkRow[]): WorkRow[] {
  return rows
    .filter((row) => isRepair(row) && !isFinal(row.status))
    .sort(
      (a, b) =>
        Number(Boolean(a.acceptedAt)) - Number(Boolean(b.acceptedAt)) || a.number - b.number,
    );
}

export function canReview(detail: WorkDetail): boolean {
  return detail.type === WorkType.PLANNED_MAINTENANCE && detail.status === WorkStatus.IN_REVIEW;
}

/** Re-planning, reassignment and cancellation apply only to work nobody has finished yet. */
export function canChange(detail: WorkDetail): boolean {
  return !isFinal(detail.status) && detail.status !== WorkStatus.IN_REVIEW;
}

export const ReleaseState = {
  HIDDEN: 'HIDDEN',
  WAITING_REPAIR: 'WAITING_REPAIR',
  READY: 'READY',
} as const;
export type ReleaseState = (typeof ReleaseState)[keyof typeof ReleaseState];

/**
 * Whether the repair card offers "Return to service": only for a machine still out of service,
 * and usable only once the mechanic finished the repair (FR-065, AC-046).
 */
export function releaseState(detail: WorkDetail): ReleaseState {
  const outOfService =
    (detail.stop !== null && detail.stop.releasedAt === null) ||
    detail.equipmentState !== EquipmentState.AVAILABLE;
  if (!isRepair(detail) || !outOfService || detail.status === WorkStatus.CANCELLED)
    return ReleaseState.HIDDEN;
  return detail.status === WorkStatus.COMPLETED ? ReleaseState.READY : ReleaseState.WAITING_REPAIR;
}
