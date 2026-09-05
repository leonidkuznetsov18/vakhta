import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import type { ResumableState, ShiftState } from '@vakhta/domain';
import { responsibilityZones } from './org.js';
import { employees } from './identity.js';
import { presenceSessions } from './attendance.js';
import { shiftAssignments } from './scheduling.js';

/** Дзеркало SHIFT_STATES з @vakhta/domain; типова перевірка нижче не дає їм розійтись. */
const SHIFT_STATE_VALUES = [
  'NOT_STARTED',
  'PREPARATION',
  'WORKING',
  'CLEANING',
  'HANDOVER',
  'BREAK',
  'MEAL',
  'SERVICE_TIME',
  'DOWNTIME',
  'READY_TO_CLOSE',
  'SHIFT_CLOSED',
  'EMERGENCY_EXIT',
] as const satisfies readonly ShiftState[];
const RESUMABLE_STATE_VALUES = [
  'PREPARATION',
  'WORKING',
  'CLEANING',
  'HANDOVER',
] as const satisfies readonly ResumableState[];

export const shiftState = pgEnum('shift_state', SHIFT_STATE_VALUES);
export const resumableState = pgEnum('resumable_state', RESUMABLE_STATE_VALUES);
export const shiftStartMethod = pgEnum('shift_start_method', ['EMPLOYEE', 'MASTER']);

/**
 * Робоча зміна (ТЗ 4.3, 4.5): від «Почати зміну» до закриття. У працівника не більше однієї
 * незакритої; resume_state є тоді й лише тоді, коли стан тимчасовий; version для optimistic lock.
 */
export const shiftSessions = pgTable(
  'shift_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    assignmentId: uuid('assignment_id').references(() => shiftAssignments.id),
    presenceId: uuid('presence_id').references(() => presenceSessions.id),
    businessDate: date('business_date').notNull(),
    state: shiftState('state').notNull().default('NOT_STARTED'),
    resumeState: resumableState('resume_state'),
    version: integer('version').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    startMethod: shiftStartMethod('start_method').notNull().default('EMPLOYEE'),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    zoneAcceptedAt: timestamp('zone_accepted_at', { withTimezone: true }),
    needsClarification: boolean('needs_clarification').notNull().default(false),
    clarificationReason: text('clarification_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shift_sessions_active_uq')
      .on(t.employeeId)
      .where(sql`${t.state} NOT IN ('SHIFT_CLOSED', 'EMERGENCY_EXIT')`),
    index('shift_sessions_employee_date_idx').on(t.employeeId, t.businessDate),
    index('shift_sessions_state_idx').on(t.state),
    index('shift_sessions_assignment_idx').on(t.assignmentId),
    check(
      'shift_sessions_resume_consistent',
      sql`(${t.state} IN ('BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME')) = (${t.resumeState} IS NOT NULL)`,
    ),
  ],
);

/**
 * Інтервали станів (ТЗ 4.5, 6.1): не перетинаються (EXCLUDE у міграції), не більше одного
 * відкритого на сесію. Сума інтервалів дорівнює тривалості зміни.
 */
export const activityIntervals = pgTable(
  'activity_intervals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shiftSessionId: uuid('shift_session_id')
      .notNull()
      .references(() => shiftSessions.id, { onDelete: 'cascade' }),
    state: shiftState('state').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    resumeState: resumableState('resume_state'),
    reasonCode: text('reason_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('activity_intervals_open_uq')
      .on(t.shiftSessionId)
      .where(sql`${t.endedAt} IS NULL`),
    index('activity_intervals_session_start_idx').on(t.shiftSessionId, t.startedAt),
    check(
      'activity_intervals_positive',
      sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`,
    ),
  ],
);

/** Підсумок закритої зміни (ТЗ 6.2). Перераховується компенсуючими подіями, не редагується вручну. */
export const shiftSummaries = pgTable(
  'shift_summaries',
  {
    shiftSessionId: uuid('shift_session_id')
      .primaryKey()
      .references(() => shiftSessions.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    businessDate: date('business_date').notNull(),
    plannedMinutes: integer('planned_minutes'),
    totalMinutes: integer('total_minutes').notNull(),
    workMinutes: integer('work_minutes').notNull(),
    preparationMinutes: integer('preparation_minutes').notNull(),
    serviceMinutes: integer('service_minutes').notNull(),
    breakMinutes: integer('break_minutes').notNull(),
    mealMinutes: integer('meal_minutes').notNull(),
    downtimeMinutes: integer('downtime_minutes').notNull(),
    lateMinutes: integer('late_minutes').notNull().default(0),
    earlyLeaveMinutes: integer('early_leave_minutes').notNull().default(0),
    overtimeMinutes: integer('overtime_minutes').notNull().default(0),
    overtimePending: boolean('overtime_pending').notNull().default(false),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shift_summaries_employee_date_idx').on(t.employeeId, t.businessDate)],
);
