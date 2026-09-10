import { sql } from 'drizzle-orm';
import {
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
import { domainEvents } from './events.js';
import { shiftSessions } from './shift.js';

export const BACKGROUND_TASK_KINDS = [
  'MEDIA_PROCESS',
  'PHOTO_INSPECT',
  'SHIFT_REMINDER',
  'ACK_REMINDER',
  'RETURN_REMINDER',
  'DOWNTIME_ESCALATION',
  'INCIDENT_SLA',
  'HANDOVER_TIMEOUT',
  'CLEANING_REMINDER',
  'BONUS_RECALCULATE',
] as const;

export type BackgroundTaskKind = (typeof BACKGROUND_TASK_KINDS)[number];

/** Safe classifications only: never persist a dependency's error message or request data. */
export const BACKGROUND_TASK_ERROR_CODES = [
  'EXECUTION_FAILED',
  'DEPENDENCY_UNAVAILABLE',
  'INVALID_PAYLOAD',
  'UNSUPPORTED_VERSION',
] as const;

export type BackgroundTaskErrorCode = (typeof BACKGROUND_TASK_ERROR_CODES)[number];

/** Durable intent and retry state. An additive migration installs the immutable-intent guard. */
export const backgroundTasks = pgTable(
  'background_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: BACKGROUND_TASK_KINDS }).notNull(),
    payloadVersion: integer('payload_version').notNull().default(1),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').$type<Readonly<Record<string, unknown>>>().notNull(),
    sourceEventId: uuid('source_event_id').references(() => domainEvents.id),
    targetSessionId: uuid('target_session_id').references(() => shiftSessions.id),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['PENDING', 'RUNNING', 'COMPLETED'] })
      .notNull()
      .default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    lastErrorCode: text('last_error_code', { enum: BACKGROUND_TASK_ERROR_CODES }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('background_tasks_dedupe_uq').on(t.dedupeKey),
    uniqueIndex('background_tasks_bonus_source_target_uq')
      .on(t.sourceEventId, t.targetSessionId)
      .where(sql`${t.kind} = 'BONUS_RECALCULATE'`),
    index('background_tasks_pending_idx')
      .on(t.kind, t.availableAt, t.id)
      .where(sql`${t.status} = 'PENDING'`),
    index('background_tasks_expired_idx')
      .on(t.kind, t.leaseUntil, t.id)
      .where(sql`${t.status} = 'RUNNING'`),
    check(
      'background_tasks_kind_valid',
      sql`${t.kind} IN ('PHOTO_INSPECT', 'MEDIA_PROCESS', 'SHIFT_REMINDER', 'ACK_REMINDER', 'RETURN_REMINDER', 'DOWNTIME_ESCALATION', 'INCIDENT_SLA', 'HANDOVER_TIMEOUT', 'CLEANING_REMINDER', 'BONUS_RECALCULATE')`,
    ),
    check('background_tasks_payload_version_valid', sql`${t.payloadVersion} > 0`),
    check('background_tasks_payload_object', sql`jsonb_typeof(${t.payload}) = 'object'`),
    check('background_tasks_dedupe_valid', sql`length(${t.dedupeKey}) BETWEEN 1 AND 250`),
    check('background_tasks_attempts_valid', sql`${t.attempts} >= 0`),
    check('background_tasks_available_valid', sql`${t.availableAt} >= ${t.dueAt}`),
    check(
      'background_tasks_bonus_target_valid',
      sql`(
      ${t.kind} = 'BONUS_RECALCULATE' AND ${t.sourceEventId} IS NOT NULL AND ${t.targetSessionId} IS NOT NULL
    ) OR (
      ${t.kind} <> 'BONUS_RECALCULATE' AND ${t.sourceEventId} IS NULL AND ${t.targetSessionId} IS NULL
    )`,
    ),
    check(
      'background_tasks_state_valid',
      sql`(
      ${t.status} = 'PENDING' AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL AND ${t.completedAt} IS NULL
    ) OR (
      ${t.status} = 'RUNNING' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.completedAt} IS NULL AND ${t.attempts} > 0
    ) OR (
      ${t.status} = 'COMPLETED' AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL AND ${t.completedAt} IS NOT NULL AND ${t.attempts} > 0
    )`,
    ),
    check(
      'background_tasks_error_valid',
      sql`${t.lastErrorCode} IS NULL OR ${t.lastErrorCode} IN ('EXECUTION_FAILED', 'DEPENDENCY_UNAVAILABLE', 'INVALID_PAYLOAD', 'UNSUPPORTED_VERSION')`,
    ),
  ],
);
