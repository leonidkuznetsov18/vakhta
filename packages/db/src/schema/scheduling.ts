import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
    revision: integer('revision').notNull().default(1),
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
    check('schedule_versions_revision_positive', sql`${t.revision} > 0`),
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
    /** Custom local start/end ('HH:MM') that replaced the template times; null means template. */
    customStart: text('custom_start'),
    customEnd: text('custom_end'),
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

/** Qualification catalog per site (SC-04, D-02): what a requirement may demand from a person. */
export const qualifications = pgTable(
  'qualifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('qualifications_site_code_uq').on(t.siteId, t.code)],
);

/** Evidence that a person holds a qualification for a period; expiry is explicit, never inferred. */
export const employeeQualifications = pgTable(
  'employee_qualifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    qualificationId: uuid('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    validFrom: date('valid_from').notNull(),
    validUntil: date('valid_until'),
    note: text('note'),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('employee_qualifications_employee_idx').on(t.employeeId, t.qualificationId),
    check(
      'employee_qualifications_valid_window',
      sql`${t.validUntil} IS NULL OR ${t.validUntil} >= ${t.validFrom}`,
    ),
  ],
);

/**
 * Effective-dated staffing demand per zone and shift template (SC-01, D-02). A row with a
 * qualification counts only holders; a zone without rows has unknown demand.
 */
export const zoneStaffingRequirements = pgTable(
  'zone_staffing_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => responsibilityZones.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => shiftTemplates.id),
    requiredCount: integer('required_count').notNull(),
    qualificationId: uuid('qualification_id').references(() => qualifications.id),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('zone_staffing_requirements_zone_idx').on(t.zoneId, t.templateId),
    check('zone_staffing_requirements_count_positive', sql`${t.requiredCount} > 0`),
    check(
      'zone_staffing_requirements_window',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
  ],
);

export const eligibilitySeverity = pgEnum('eligibility_severity', ['BLOCK', 'WARN']);

/** Rest and monthly-hour limits per site (D-03): configured, versioned by audit, never invented. */
export const siteSchedulingRules = pgTable(
  'site_scheduling_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    minRestMinutes: integer('min_rest_minutes').notNull().default(660),
    maxMonthMinutes: integer('max_month_minutes').notNull().default(12000),
    restSeverity: eligibilitySeverity('rest_severity').notNull().default('WARN'),
    hoursSeverity: eligibilitySeverity('hours_severity').notNull().default('WARN'),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_scheduling_rules_site_uq').on(t.siteId),
    check('site_scheduling_rules_rest_nonnegative', sql`${t.minRestMinutes} >= 0`),
    check('site_scheduling_rules_hours_positive', sql`${t.maxMonthMinutes} > 0`),
  ],
);

export const availabilityKind = pgEnum('availability_kind', ['UNAVAILABLE', 'PREFERRED']);

/** A person's own availability preference (SC-33): distinct from approved absence. */
export const employeeAvailability = pgTable(
  'employee_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    kind: availabilityKind('kind').notNull(),
    /** 0 = Sunday … 6 = Saturday for a recurring preference; null when `date` is set. */
    weekday: integer('weekday'),
    date: date('date'),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    note: text('note'),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('employee_availability_employee_idx').on(t.employeeId),
    check(
      'employee_availability_target',
      sql`(${t.weekday} IS NULL) <> (${t.date} IS NULL) AND (${t.weekday} IS NULL OR ${t.weekday} BETWEEN 0 AND 6)`,
    ),
    check(
      'employee_availability_window',
      sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`,
    ),
  ],
);

/** Named batch inputs a planner reuses (SC-26): rotation, template, mode and optional zone. */
export const schedulePatterns = pgTable(
  'schedule_patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    name: text('name').notNull(),
    definition: jsonb('definition').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('schedule_patterns_site_name_uq').on(t.siteId, t.name)],
);

/**
 * Ordered zone segments of one assignment (SC-37, D-04): they tile the planned interval without
 * gaps or overlaps; the parent assignment keeps identity, times and attendance links.
 */
export const assignmentSegments = pgTable(
  'assignment_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => shiftAssignments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => responsibilityZones.id),
    localStart: text('local_start').notNull(),
    localEnd: text('local_end').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assignment_segments_position_uq').on(t.assignmentId, t.position),
    check('assignment_segments_position_nonnegative', sql`${t.position} >= 0`),
  ],
);

/**
 * Planned breaks of one assignment (SC-36, D-04): ordered intervals inside the planned shift, each
 * optionally relieved by another planned worker. Planned breaks never touch actual break events.
 */
export const assignmentBreaks = pgTable(
  'assignment_breaks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => shiftAssignments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    localStart: text('local_start').notNull(),
    localEnd: text('local_end').notNull(),
    reliefEmployeeId: uuid('relief_employee_id').references(() => employees.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assignment_breaks_position_uq').on(t.assignmentId, t.position),
    check('assignment_breaks_position_nonnegative', sql`${t.position} >= 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Open slots, deliberate offers and interest (SC-15, SC-16, D-06)     */
/* ------------------------------------------------------------------ */

export const openSlotStatus = pgEnum('open_slot_status', [
  'OPEN',
  'OFFERED',
  'FILLED',
  'CANCELLED',
]);
export const slotOfferStatus = pgEnum('slot_offer_status', ['OPEN', 'CLOSED', 'CANCELLED']);
export const slotInterestResponse = pgEnum('slot_interest_response', ['INTERESTED', 'DECLINED']);

/**
 * An internal unassigned planning slot of a unit month. It never counts as an assigned person or
 * satisfied demand; it is invisible to employees until deliberately offered and fills at most once.
 */
export const openSlots = pgTable(
  'open_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    periodMonth: text('period_month').notNull(),
    businessDate: date('business_date').notNull(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => shiftTemplates.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => responsibilityZones.id),
    status: openSlotStatus('status').notNull().default('OPEN'),
    filledEmployeeId: uuid('filled_employee_id').references(() => employees.id),
    filledVersionId: uuid('filled_version_id').references(() => scheduleVersions.id),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('open_slots_scope_idx').on(t.siteId, t.orgUnitId, t.periodMonth),
    check(
      'open_slots_filled_consistent',
      sql`(${t.status} = 'FILLED') = (${t.filledEmployeeId} IS NOT NULL)`,
    ),
  ],
);

/** A deliberate offer of a slot to an audience; interest is collected against one offer. */
export const slotOffers = pgTable(
  'slot_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => openSlots.id, { onDelete: 'cascade' }),
    audience: text('audience').notNull(),
    status: slotOfferStatus('status').notNull().default('OPEN'),
    notifiedCount: integer('notified_count').notNull().default(0),
    offeredBy: uuid('offered_by'),
    offeredAt: timestamp('offered_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('slot_offers_slot_idx').on(t.slotId)],
);

/** An employee's response to one offer; a response is never an assignment (SC-16). */
export const slotInterests = pgTable(
  'slot_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => slotOffers.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    response: slotInterestResponse('response').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('slot_interests_offer_employee_uq').on(t.offerId, t.employeeId)],
);

/* ------------------------------------------------------------------ */
/* Schedule notes (SC-39, SC-50)                                        */
/* ------------------------------------------------------------------ */

export const noteAudience = pgEnum('note_audience', ['PLANNERS', 'EMPLOYEES']);

/**
 * A note on a unit month, optionally narrowed to a date, zone or person. The audience is explicit:
 * PLANNERS notes stay in the panel; EMPLOYEES notes reach the person's plan in the bot.
 */
export const scheduleNotes = pgTable(
  'schedule_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    periodMonth: text('period_month').notNull(),
    businessDate: date('business_date'),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    employeeId: uuid('employee_id').references(() => employees.id),
    audience: noteAudience('audience').notNull().default('PLANNERS'),
    text: text('text').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('schedule_notes_scope_idx').on(t.siteId, t.orgUnitId, t.periodMonth),
    check('schedule_notes_text_bounded', sql`char_length(${t.text}) BETWEEN 1 AND 2000`),
  ],
);
