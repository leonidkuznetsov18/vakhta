import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { employees } from './identity.js';
import { orgUnits, positions, responsibilityZones, sites, teams } from './org.js';

export const scheduleStatus = pgEnum('schedule_status', [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'CLOSED',
]);
export const shiftKind = pgEnum('shift_kind', ['REGULAR', 'EXTRA', 'REPLACEMENT', 'SWAP']);
export const assignmentStatus = pgEnum('assignment_status', ['PLANNED', 'CANCELLED', 'REPLACED']);

/** Типові 12-годинні зміни майданчика: день 08:00–20:00, ніч 20:00–08:00 (ТЗ 3, 18 п. 3). */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    localStart: text('local_start').notNull(),
    localEnd: text('local_end').notNull(),
    isNight: boolean('is_night').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('shift_templates_site_code_uq').on(t.siteId, t.code)],
);

/**
 * Версія графіка на місяць для підрозділу (ТЗ 3.1). Опублікована версія не редагується;
 * нова публікація переводить попередню в SUPERSEDED. Лише одна PUBLISHED на ключ.
 */
export const scheduleVersions = pgTable(
  'schedule_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    /** 'YYYY-MM' */
    periodMonth: text('period_month').notNull(),
    versionNo: integer('version_no').notNull(),
    status: scheduleStatus('status').notNull().default('DRAFT'),
    createdBy: uuid('created_by'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedBy: uuid('approved_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => scheduleVersions.id),
    changeReason: text('change_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('schedule_versions_key_no_uq').on(
      t.siteId,
      t.orgUnitId,
      t.periodMonth,
      t.versionNo,
    ),
    uniqueIndex('schedule_versions_published_uq')
      .on(t.siteId, t.orgUnitId, t.periodMonth)
      .where(sql`${t.status} = 'PUBLISHED'`),
    index('schedule_versions_unit_month_idx').on(t.orgUnitId, t.periodMonth),
  ],
);

/** Призначення працівника на зміну; планові моменти обчислені при записі за tz майданчика. */
export const shiftAssignments = pgTable(
  'shift_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleVersionId: uuid('schedule_version_id')
      .notNull()
      .references(() => scheduleVersions.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    templateId: uuid('template_id')
      .notNull()
      .references(() => shiftTemplates.id),
    businessDate: date('business_date').notNull(),
    planStartAt: timestamp('plan_start_at', { withTimezone: true }).notNull(),
    planEndAt: timestamp('plan_end_at', { withTimezone: true }).notNull(),
    positionId: uuid('position_id').references(() => positions.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    teamId: uuid('team_id').references(() => teams.id),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    kind: shiftKind('kind').notNull().default('REGULAR'),
    status: assignmentStatus('status').notNull().default('PLANNED'),
    replacesAssignmentId: uuid('replaces_assignment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shift_assignments_version_employee_date_uq').on(
      t.scheduleVersionId,
      t.employeeId,
      t.businessDate,
    ),
    index('shift_assignments_employee_start_idx').on(t.employeeId, t.planStartAt),
    index('shift_assignments_version_idx').on(t.scheduleVersionId),
  ],
);

/** «Ознайомлений» підтверджує отримання, не згоду на переробку (ТЗ 3.2). */
export const assignmentAcknowledgements = pgTable(
  'assignment_acknowledgements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .unique()
      .references(() => shiftAssignments.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    scheduleVersionId: uuid('schedule_version_id')
      .notNull()
      .references(() => scheduleVersions.id, { onDelete: 'cascade' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
    /** 'TELEGRAM' або 'WEB' */
    source: text('source').notNull(),
  },
  (t) => [index('assignment_acks_version_employee_idx').on(t.scheduleVersionId, t.employeeId)],
);
