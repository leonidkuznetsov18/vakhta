import { WorkPriority } from './codes.js';
import type { IncidentSeverity } from '../incidents/lifecycle.js';

const SAFETY: IncidentSeverity = 'SAFETY';
const NORMAL: IncidentSeverity = 'NORMAL';

/** Minutes to accept an emergency repair per priority and the gap before the next escalation. */
export interface EmergencyPolicy {
  readonly ackMinutes: Readonly<Record<'P0' | 'P1' | 'P2', number>>;
  readonly escalationGapMinutes: number;
}

/** Pilot values from TZ-M §12 and §29; tenants may override them. */
export const DEFAULT_EMERGENCY_POLICY: EmergencyPolicy = {
  ackMinutes: { P0: 2, P1: 5, P2: 30 },
  escalationGapMinutes: 5,
};

export type EmergencyPriority =
  typeof WorkPriority.P0 | typeof WorkPriority.P1 | typeof WorkPriority.P2;

/** Safety is P0, a stopped machine P1, a fault without a stop P2 (FR-062). */
export function emergencyPriority(
  severity: IncidentSeverity,
  stoppedWork: boolean,
): EmergencyPriority {
  if (severity === SAFETY) return WorkPriority.P0;
  if (stoppedWork) return WorkPriority.P1;
  return WorkPriority.P2;
}

/** A report creates a repair only when it stops the machine or its reason is critical. */
export function reportNeedsRepair(severity: IncidentSeverity, stoppedWork: boolean): boolean {
  return stoppedWork || severity !== NORMAL;
}

export interface EmergencyDeadlines {
  readonly ackDueAt: Date;
  readonly escalateAt: Date;
  /** P0 informs the master and management at once (TZ-M §12). */
  readonly escalateImmediately: boolean;
}

/** Deadlines count from the server receipt and are never reset by reassignment (TZ-M R07). */
export function emergencyDeadlines(
  receivedAt: Date,
  priority: EmergencyPriority,
  policy: EmergencyPolicy,
): EmergencyDeadlines {
  const ackDueAt = new Date(receivedAt.getTime() + policy.ackMinutes[priority] * 60_000);
  return {
    ackDueAt,
    escalateAt: new Date(ackDueAt.getTime() + policy.escalationGapMinutes * 60_000),
    escalateImmediately: priority === WorkPriority.P0,
  };
}
