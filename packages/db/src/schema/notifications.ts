import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { NotificationPayload } from '@vakhta/domain';

export const recipientType = pgEnum('recipient_type', ['EMPLOYEE', 'WEB_USER']);
export const notificationChannel = pgEnum('notification_channel', ['TELEGRAM']);
export const notificationStatus = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
]);

/**
 * Аутбокс нотифікацій (ADR-8, FR-NTF-01): рядок створюється в тій самій транзакції, що і подія;
 * воркер забирає PENDING через SKIP LOCKED, шле і зберігає статус доставки.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientType: recipientType('recipient_type').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    channel: notificationChannel('channel').notNull().default('TELEGRAM'),
    template: text('template').notNull(),
    payload: jsonb('payload').$type<NotificationPayload>().notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: notificationStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notification_outbox_pending_idx').on(t.status, t.nextAttemptAt)],
);
