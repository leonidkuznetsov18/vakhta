/** Назви черг BullMQ, спільні для api і worker (ADR-8). */
export const QUEUES = Object.freeze({
  /** Доставка нотифікацій із notification_outbox. */
  outbox: 'outbox',
  /** Нагадування й ескалації з детермінованими jobId. */
  timers: 'timers',
  /** Перенесення фото з Telegram у S3 і технічна перевірка. */
  media: 'media',
  /** Перерахунок балів за зміну. */
  bonus: 'bonus',
});

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
