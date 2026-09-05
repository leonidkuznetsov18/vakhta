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
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * Імена відкладених job-ів у черзі timers; jobId детермінований (ADR-8).
 * Роздільник крапка: BullMQ забороняє двокрапку у власних ідентифікаторах.
 */
export const TIMER_JOBS = {
  shiftReminder: 'shift-reminder',
  ackReminder: 'ack-reminder',
} as const;

export function shiftReminderJobId(assignmentId: string): string {
  return `${TIMER_JOBS.shiftReminder}.${assignmentId}`;
}

export function ackReminderJobId(versionId: string, employeeId: string): string {
  return `${TIMER_JOBS.ackReminder}.${versionId}.${employeeId}`;
}
