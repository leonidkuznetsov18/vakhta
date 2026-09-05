/** Що лежить у notification_outbox.payload (ADR-8). Текст рендериться при постановці в чергу. */
export interface NotificationButton {
  readonly text: string;
  /** callback data для inline-кнопки, не більше 64 байтів. */
  readonly callbackData: string;
}

export interface NotificationPayload {
  readonly text: string;
  /** Рядки inline-клавіатури. */
  readonly buttons?: readonly (readonly NotificationButton[])[];
}

export const NOTIFICATION_TEMPLATES = [
  'SCHEDULE_PUBLISHED',
  'SCHEDULE_CHANGED',
  'SHIFT_REMINDER',
  'ACK_REMINDER',
  'RETURN_REMINDER',
  'DOWNTIME_ESCALATION',
  'SHIFT_SUMMARY',
  'SHIFT_FLAGGED',
  'INCIDENT_RESOLVED',
  'CLEANING_REMINDER',
  'HANDOVER_PENDING',
  'HANDOVER_REVIEWED',
  'HANDOVER_RESOLVED',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * Імена відкладених job-ів у черзі timers; jobId детермінований (ADR-8).
 * Роздільник крапка: BullMQ забороняє двокрапку у власних ідентифікаторах.
 */
export const TIMER_JOBS = {
  shiftReminder: 'shift-reminder',
  ackReminder: 'ack-reminder',
  returnReminder: 'return-reminder',
  downtimeEscalation: 'downtime-escalation',
  incidentSla: 'incident-sla',
  handoverTimeout: 'handover-timeout',
  cleaningReminder: 'cleaning-reminder',
} as const;

export function shiftReminderJobId(assignmentId: string): string {
  return `${TIMER_JOBS.shiftReminder}.${assignmentId}`;
}

export function ackReminderJobId(versionId: string, employeeId: string): string {
  return `${TIMER_JOBS.ackReminder}.${versionId}.${employeeId}`;
}

/** Нагадування повернутись із перерви, обіду чи службового часу; привʼязане до інтервалу. */
export function returnReminderJobId(sessionId: string, intervalId: string): string {
  return `${TIMER_JOBS.returnReminder}.${sessionId}.${intervalId}`;
}

/** Ескалація простою майстру після порогу (ТЗ 18, п. 9). */
export function downtimeEscalationJobId(sessionId: string, intervalId: string): string {
  return `${TIMER_JOBS.downtimeEscalation}.${sessionId}.${intervalId}`;
}

/** Перевірка SLA спільного інциденту (FR-DWN-03). */
export function incidentSlaJobId(incidentId: string): string {
  return `${TIMER_JOBS.incidentSla}.${incidentId}`;
}

/** Тайм-аут приймання: зона переходить майстру (FR-HND-06). */
export function handoverTimeoutJobId(handoverId: string): string {
  return `${TIMER_JOBS.handoverTimeout}.${handoverId}`;
}

/** Нагадування про прибирання перед кінцем зміни (FR-CLN-01). */
export function cleaningReminderJobId(sessionId: string): string {
  return `${TIMER_JOBS.cleaningReminder}.${sessionId}`;
}
