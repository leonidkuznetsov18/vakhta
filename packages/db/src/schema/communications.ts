import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUser } from './auth.js';
import { employees, telegramAccounts } from './identity.js';

const instant = (name: string) => timestamp(name, { withTimezone: true });
export const communications = pgTable(
  'communications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => authUser.id),
    requestId: uuid('request_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    body: text('body').notNull(),
    questionnaire: jsonb('questionnaire').$type<unknown>(),
    createdAt: instant('created_at').notNull().defaultNow(),
    closedAt: instant('closed_at'),
  },
  (t) => [
    uniqueIndex('communications_request_uq').on(t.senderId, t.requestId),
    index('communications_sender_idx').on(t.senderId, t.createdAt),
  ],
);

export const communicationAttachments = pgTable(
  'communication_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => authUser.id),
    communicationId: uuid('communication_id').references(() => communications.id),
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status').notNull().default('UPLOADING'),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('communication_attachment_size', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
    check('communication_attachment_status', sql`${t.status} IN ('UPLOADING','READY','DELETING')`),
    index('communication_attachment_expiry_idx').on(t.expiresAt),
  ],
);

export const communicationRecipients = pgTable(
  'communication_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communicationId: uuid('communication_id')
      .notNull()
      .references(() => communications.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    telegramAccountId: uuid('telegram_account_id')
      .notNull()
      .references(() => telegramAccounts.id),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }).notNull(),
    answers: jsonb('answers').$type<unknown>().notNull().default({}),
    questionIndex: integer('question_index').notNull().default(0),
    responseVersion: integer('response_version').notNull().default(0),
    startedAt: instant('started_at'),
    submittedAt: instant('submitted_at'),
  },
  (t) => [
    uniqueIndex('communication_recipient_uq').on(t.communicationId, t.employeeId),
    check('communication_question_index', sql`${t.questionIndex} >= 0`),
    check('communication_response_version', sql`${t.responseVersion} >= 0`),
  ],
);

export const communicationParts = pgTable(
  'communication_parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => communicationRecipients.id),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: instant('next_attempt_at').notNull().defaultNow(),
    claimId: uuid('claim_id'),
    leaseUntil: instant('lease_until'),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
    lastError: text('last_error'),
    sentAt: instant('sent_at'),
  },
  (t) => [
    uniqueIndex('communication_part_order_uq').on(t.recipientId, t.ordinal),
    check('communication_part_order', sql`${t.ordinal} >= 0`),
    check(
      'communication_part_status',
      sql`${t.status} IN ('PENDING','SENDING','SENT','FAILED','SKIPPED','UNKNOWN')`,
    ),
    check('communication_part_kind', sql`${t.kind} IN ('TEXT','ATTACHMENT','QUESTIONNAIRE')`),
    index('communication_part_pending_idx').on(t.status, t.nextAttemptAt),
  ],
);
