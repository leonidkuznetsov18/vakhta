/**
 * Життєвий цикл спільного інциденту (ТЗ 5.5): REPORTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED,
 * додатково DUPLICATE і REJECTED. Критичність SAFETY не окремий статус, а негайна ескалація (FR-DWN-03).
 */
export const INCIDENT_STATUSES = [
  'REPORTED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
  'REJECTED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['NORMAL', 'CRITICAL', 'SAFETY'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** Статуси, в яких інцидент ще «живий»: за ними рахується SLA і до них лінкуються нові повідомлення. */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'REPORTED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
];

export function isOpenIncident(status: IncidentStatus): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status);
}

const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  REPORTED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DUPLICATE', 'REJECTED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'DUPLICATE', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'ACKNOWLEDGED'],
  /** Повторне відкриття, якщо проблема повернулась до закриття. */
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  DUPLICATE: [],
  REJECTED: [],
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedIncidentTransitions(from: IncidentStatus): readonly IncidentStatus[] {
  return TRANSITIONS[from];
}

export interface SlaPolicy {
  /** Хвилини до першої реакції майстра за критичністю; 0 означає негайну ескалацію. */
  readonly normalMinutes: number;
  readonly criticalMinutes: number;
  readonly safetyMinutes: number;
}

export function slaDueAt(reportedAt: Date, severity: IncidentSeverity, policy: SlaPolicy): Date {
  const minutes =
    severity === 'SAFETY'
      ? policy.safetyMinutes
      : severity === 'CRITICAL'
        ? policy.criticalMinutes
        : policy.normalMinutes;
  return new Date(reportedAt.getTime() + minutes * 60_000);
}

/** Безпека ескалюється негайно (FR-DWN-03); решта після SLA. */
export function escalatesImmediately(severity: IncidentSeverity): boolean {
  return severity === 'SAFETY';
}

/** SLA порушено, якщо реакції не було до строку; для закритих порівнюється фактичний час реакції. */
export function slaBreached(
  incident: {
    readonly slaDueAt: Date;
    readonly acknowledgedAt: Date | null;
    readonly resolvedAt: Date | null;
  },
  now: Date,
): boolean {
  const reacted = incident.acknowledgedAt ?? incident.resolvedAt;
  if (reacted) return reacted.getTime() > incident.slaDueAt.getTime();
  return now.getTime() > incident.slaDueAt.getTime();
}
