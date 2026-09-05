import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const eventSource = pgEnum('event_source', [
  'TELEGRAM',
  'WEB',
  'TERMINAL',
  'SYSTEM',
  'INTEGRATION',
]);

/**
 * Журнал подій, джерело істини (ADR-1, ТЗ 11.1). Append-only: міграція
 * append_only_guards додає тригери, що забороняють UPDATE і DELETE.
 */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    employeeId: uuid('employee_id'),
    shiftSessionId: uuid('shift_session_id'),
    zoneId: uuid('zone_id'),
    incidentId: uuid('incident_id'),
    source: eventSource('source').notNull(),
    actorId: uuid('actor_id'),
    actingRole: text('acting_role'),
    reasonCode: text('reason_code'),
    comment: text('comment'),
    approvalId: uuid('approval_id'),
    telegramUpdateId: bigint('telegram_update_id', { mode: 'number' }),
    idempotencyKey: text('idempotency_key'),
    /** Компенсуюча подія посилається на ту, яку виправляє (FR-COR-03). */
    correctsEventId: uuid('corrects_event_id'),
    scheduleVersionId: uuid('schedule_version_id'),
    checklistVersionId: uuid('checklist_version_id'),
    bonusRuleVersionId: uuid('bonus_rule_version_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    traceId: text('trace_id'),
  },
  (t) => [
    index('domain_events_employee_time_idx').on(t.employeeId, t.occurredAt),
    index('domain_events_shift_idx').on(t.shiftSessionId, t.occurredAt),
    index('domain_events_type_time_idx').on(t.type, t.occurredAt),
    uniqueIndex('domain_events_idempotency_uq')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

export const actorType = pgEnum('actor_type', ['EMPLOYEE', 'WEB_USER', 'SYSTEM', 'TERMINAL']);

/** Незмінний аудит ручних дій, входів, переглядів і вивантажень (ТЗ 13, FR-WEB-05). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    actorType: actorType('actor_type').notNull(),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: text('object_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    ip: inet('ip'),
    traceId: text('trace_id'),
  },
  (t) => [
    index('audit_log_actor_time_idx').on(t.actorId, t.at),
    index('audit_log_object_idx').on(t.objectType, t.objectId),
  ],
);
