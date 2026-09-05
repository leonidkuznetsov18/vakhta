import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { IncidentSeverity, IncidentStatus } from '@vakhta/domain';
import { employees } from './identity.js';
import { orgUnits, responsibilityZones, sites } from './org.js';
import { shiftSessions } from './shift.js';

const INCIDENT_STATUS_VALUES = [
  'REPORTED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
  'REJECTED',
] as const satisfies readonly IncidentStatus[];
const INCIDENT_SEVERITY_VALUES = [
  'NORMAL',
  'CRITICAL',
  'SAFETY',
] as const satisfies readonly IncidentSeverity[];

export const incidentStatus = pgEnum('incident_status', INCIDENT_STATUS_VALUES);
export const incidentSeverity = pgEnum('incident_severity', INCIDENT_SEVERITY_VALUES);

/** Спільний інцидент (ТЗ 5.5, FR-DWN-04): може пережити зміну і стосуватись багатьох працівників. */
export const downtimeIncidents = pgTable(
  'downtime_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id').references(() => sites.id),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    reasonCode: text('reason_code').notNull(),
    severity: incidentSeverity('severity').notNull().default('NORMAL'),
    status: incidentStatus('status').notNull().default('REPORTED'),
    duplicateOfId: uuid('duplicate_of_id'),
    assigneeId: text('assignee_id'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    reportsCount: integer('reports_count').notNull().default(0),
    lastComment: text('last_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('downtime_incidents_status_opened_idx').on(t.status, t.openedAt),
    index('downtime_incidents_zone_status_idx').on(t.zoneId, t.status),
    index('downtime_incidents_site_opened_idx').on(t.siteId, t.openedAt),
  ],
);

/** Повідомлення працівника (ТЗ 5.5): вихідні дані зберігаються навіть після злиття (FR-DWN-05). */
export const downtimeReports = pgTable(
  'downtime_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => downtimeIncidents.id),
    shiftSessionId: uuid('shift_session_id').references(() => shiftSessions.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    reasonCode: text('reason_code').notNull(),
    comment: text('comment'),
    stoppedWork: boolean('stopped_work').notNull().default(false),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
    telegramFileId: text('telegram_file_id'),
    mediaObjectId: uuid('media_object_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('downtime_reports_incident_idx').on(t.incidentId),
    index('downtime_reports_session_idx').on(t.shiftSessionId),
    index('downtime_reports_employee_time_idx').on(t.employeeId, t.reportedAt),
  ],
);

/** Кожна зміна статусу зберігає автора, час і коментар (ТЗ 5.5). */
export const incidentStatusHistory = pgTable(
  'incident_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => downtimeIncidents.id, { onDelete: 'cascade' }),
    fromStatus: incidentStatus('from_status'),
    toStatus: incidentStatus('to_status').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    comment: text('comment'),
  },
  (t) => [index('incident_status_history_incident_idx').on(t.incidentId, t.at)],
);
