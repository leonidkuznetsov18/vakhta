import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

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

export const ListScheduleVersionsQuery = z.object({
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
  periodMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type ListScheduleVersionsQuery = z.infer<typeof ListScheduleVersionsQuery>;
