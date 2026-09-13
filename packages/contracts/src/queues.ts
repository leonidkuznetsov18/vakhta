import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';

/**
 * Назви черг BullMQ, спільні для api і worker (ADR-8). Доставка нотифікацій йде не через
 * чергу, а через опитування notification_outbox із SKIP LOCKED.
 */
export const QUEUES = Object.freeze({
  /** Нагадування й ескалації з детермінованими jobId. */
  timers: 'timers',
  /** Перенесення фото з Telegram у S3 і технічна перевірка. */
  media: 'media',
  /** Перерахунок балів за зміну. */
  bonus: 'bonus',
});

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const ShiftReminderJob = z.object({ assignmentId: Uuid, fireAt: IsoDateTime });
export type ShiftReminderJob = z.infer<typeof ShiftReminderJob>;

export const AckReminderJob = z.object({ versionId: Uuid, employeeId: Uuid, fireAt: IsoDateTime });
export type AckReminderJob = z.infer<typeof AckReminderJob>;

/** Нагадування повернутись: воркер перевіряє, що інтервал ще відкритий (ADR-8). */
export const ReturnReminderJob = z.object({
  sessionId: Uuid,
  intervalId: Uuid,
  state: z.enum(['BREAK', 'MEAL', 'SERVICE_TIME']),
  limitMinutes: z.number().int().positive(),
  fireAt: IsoDateTime,
});
export type ReturnReminderJob = z.infer<typeof ReturnReminderJob>;

export const DowntimeEscalationJob = z.object({
  sessionId: Uuid,
  intervalId: Uuid,
  thresholdMinutes: z.number().int().positive(),
  fireAt: IsoDateTime,
});
export type DowntimeEscalationJob = z.infer<typeof DowntimeEscalationJob>;

export const ListScheduleVersionsQuery = z.object({
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
  periodMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type ListScheduleVersionsQuery = z.infer<typeof ListScheduleVersionsQuery>;

export const IncidentSlaJob = z.object({ incidentId: Uuid, fireAt: IsoDateTime });
export type IncidentSlaJob = z.infer<typeof IncidentSlaJob>;

/** Перенесення фото з Telegram у сховище і технічна перевірка (ADR-0006). */
export const MediaJob = z.object({ mediaObjectId: Uuid });
export type MediaJob = z.infer<typeof MediaJob>;

export const HandoverTimeoutJob = z.object({ handoverId: Uuid, fireAt: IsoDateTime });
export type HandoverTimeoutJob = z.infer<typeof HandoverTimeoutJob>;

export const CleaningReminderJob = z.object({ sessionId: Uuid, fireAt: IsoDateTime });
export type CleaningReminderJob = z.infer<typeof CleaningReminderJob>;

/** Yearly greeting; the worker re-enqueues next year after sending (calendar events, #61). */
export const BirthdayGreetingJob = z.object({ employeeId: Uuid, fireAt: IsoDateTime });
export type BirthdayGreetingJob = z.infer<typeof BirthdayGreetingJob>;

/** One "how are you" per sick-leave day; the worker rechecks the request is still approved. */
export const AbsenceCheckinJob = z.object({
  requestId: Uuid,
  businessDate: BusinessDate,
  fireAt: IsoDateTime,
});
export type AbsenceCheckinJob = z.infer<typeof AbsenceCheckinJob>;

/** The day before a vacation ends: remind the plan that follows. */
export const AbsenceReturnJob = z.object({ requestId: Uuid, fireAt: IsoDateTime });
export type AbsenceReturnJob = z.infer<typeof AbsenceReturnJob>;
