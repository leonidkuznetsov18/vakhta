import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { BonusRules, MonthMaster } from '@vakhta/domain';
import { date } from 'drizzle-orm/pg-core';
import { employees } from './identity.js';
import { orgUnits, sites } from './org.js';
import { handoverRecords } from './handover.js';
import { shiftSessions } from './shift.js';

export const bonusScoreStatus = pgEnum('bonus_score_status', [
  'PRELIMINARY',
  'PENDING',
  'MANUAL_REVIEW',
  'APPEALED',
  'CONFIRMED',
  'NOT_EVALUATED',
]);
export const bonusPeriodStatus = pgEnum('bonus_period_status', ['OPEN', 'CLOSING', 'CLOSED']);
export const adjustmentStatus = pgEnum('adjustment_status', [
  'PENDING_SECOND',
  'APPLIED',
  'REJECTED',
  'CANCELLED',
]);

/** Версії правил бонусу (ТЗ 7.1, ADR-0007): JSON з датою дії, не застосовуються заднім числом. */
export const bonusRuleVersions = pgTable(
  'bonus_rule_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id').references(() => sites.id),
    label: text('label').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    rules: jsonb('rules').$type<BonusRules>().notNull(),
    createdBy: text('created_by'),
    approvedBy: text('approved_by'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bonus_rule_versions_site_valid_idx').on(t.siteId, t.validFrom)],
);

/** Оцінка зміни: підсумок і статус; критерії окремо (ТЗ 7.6). */
export const bonusShiftScores = pgTable(
  'bonus_shift_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shiftSessionId: uuid('shift_session_id')
      .notNull()
      .references(() => shiftSessions.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    businessDate: text('business_date').notNull(),
    ruleVersionId: uuid('rule_version_id')
      .notNull()
      .references(() => bonusRuleVersions.id),
    status: bonusScoreStatus('status').notNull().default('PRELIMINARY'),
    score: integer('score'),
    applicableMax: integer('applicable_max').notNull(),
    earned: integer('earned').notNull(),
    /** Вага зміни для місяця: планова тривалість у хвилинах (ТЗ 7.6). */
    plannedMinutes: integer('planned_minutes').notNull().default(720),
    inputsHash: text('inputs_hash').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedBy: text('confirmed_by'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    excludedReason: text('excluded_reason'),
    /** Manual review of a shift the rules cannot score (spec 7.6): SCORE with a value or EXCLUDE. */
    reviewDecision: text('review_decision'),
    manualScore: integer('manual_score'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewComment: text('review_comment'),
  },
  (t) => [
    uniqueIndex('bonus_shift_scores_session_uq').on(t.shiftSessionId),
    index('bonus_shift_scores_employee_date_idx').on(t.employeeId, t.businessDate),
  ],
);

export const bonusCriteriaResults = pgTable(
  'bonus_criteria_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreId: uuid('score_id')
      .notNull()
      .references(() => bonusShiftScores.id, { onDelete: 'cascade' }),
    criterion: text('criterion').notNull(),
    section: text('section').notNull(),
    maxPoints: integer('max_points').notNull(),
    earnedPoints: integer('earned_points').notNull(),
    status: text('status').notNull(),
    basis: jsonb('basis').$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex('bonus_criteria_results_uq').on(t.scoreId, t.criterion)],
);

/** Ручне коригування з причиною, автором і другим підтвердженням понад поріг (ТЗ 7.7). */
export const bonusAdjustments = pgTable(
  'bonus_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreId: uuid('score_id')
      .notNull()
      .references(() => bonusShiftScores.id, { onDelete: 'cascade' }),
    /** null: the points go to the shift score itself (a plain bonus or penalty). */
    criterion: text('criterion'),
    delta: integer('delta').notNull(),
    reasonCode: text('reason_code').notNull(),
    comment: text('comment').notNull(),
    authorId: text('author_id'),
    status: adjustmentStatus('status').notNull().default('APPLIED'),
    secondApproverId: text('second_approver_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bonus_adjustments_score_idx').on(t.scoreId)],
);

/** Розрахунковий період: закриття фіксує версію правил і підтверджує бали (матриця ТЗ 2.1). */
export const bonusPeriods = pgTable(
  'bonus_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    month: text('month').notNull(),
    status: bonusPeriodStatus('status').notNull().default('OPEN'),
    ruleVersionId: uuid('rule_version_id').references(() => bonusRuleVersions.id),
    closedBy: text('closed_by'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bonus_periods_site_month_uq').on(t.siteId, t.month)],
);

export const bonusPeriodResults = pgTable(
  'bonus_period_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => bonusPeriods.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    shifts: integer('shifts').notNull(),
    evaluatedShifts: integer('evaluated_shifts').notNull(),
    pendingShifts: integer('pending_shifts').notNull(),
    sMonth: numeric('s_month', { precision: 6, scale: 2 }),
    weightSum: numeric('weight_sum', { precision: 8, scale: 3 }).notNull(),
    baseAmount: numeric('base_amount', { precision: 12, scale: 2 }),
    bonusAmount: numeric('bonus_amount', { precision: 12, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bonus_period_results_uq').on(t.periodId, t.employeeId)],
);

export const pointAwardKind = pgEnum('point_award_kind', [
  /** The shift master approved the employee's checklist: one point. */
  'CHECKLIST_APPROVED',
  /** Everyone in the unit of the month gets an extra point. */
  'UNIT_OF_MONTH',
  /** The shift master of the unit of the month gets an extra point. */
  'MASTER_OF_MONTH',
]);

/**
 * The points ledger (2026-09-08). Every point ever earned is one append-only row, so the month's
 * total resets naturally (rows carry their month) while the whole history stays readable by day,
 * month or year. A checklist point is tied to its handover, which keeps awarding idempotent.
 */
export const bonusPointAwards = pgTable(
  'bonus_point_awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    /** The employee's unit when the point was earned, so unit totals stay stable afterwards. */
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id),
    /** 'YYYY-MM': the period the point belongs to. */
    month: text('month').notNull(),
    /** The day it was earned; null for month-end awards. */
    businessDate: date('business_date'),
    kind: pointAwardKind('kind').notNull(),
    points: integer('points').notNull().default(1),
    handoverId: uuid('handover_id').references(() => handoverRecords.id),
    note: text('note'),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bonus_point_awards_month_idx').on(t.month),
    index('bonus_point_awards_employee_month_idx').on(t.employeeId, t.month),
    index('bonus_point_awards_unit_month_idx').on(t.orgUnitId, t.month),
    /** One point per approved checklist, however many times the approval is replayed. */
    uniqueIndex('bonus_point_awards_handover_uq').on(t.handoverId),
    /** One month-end award of each kind per employee, however many times the month is closed. */
    uniqueIndex('bonus_point_awards_month_kind_uq')
      .on(t.employeeId, t.month, t.kind)
      .where(sql`${t.kind} <> 'CHECKLIST_APPROVED'`),
  ],
);

/** Immutable final nominations for the points model; independent of legacy bonus_periods. */
export const bonusMonthClosures = pgTable(
  'bonus_month_closures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    month: text('month').notNull(),
    employeeId: uuid('employee_id').references(() => employees.id),
    employeeName: text('employee_name'),
    employeePoints: integer('employee_points'),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id),
    orgUnitName: text('org_unit_name'),
    orgUnitPoints: integer('org_unit_points'),
    masters: jsonb('masters').$type<readonly MonthMaster[]>().notNull().default([]),
    ruleVersion: integer('rule_version').notNull().default(1),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('bonus_month_closures_site_month_uq').on(t.siteId, t.month),
    check('bonus_month_closures_month_valid', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check(
      'bonus_month_closures_employee_consistent',
      sql`(${t.employeeId} is null and ${t.employeeName} is null and ${t.employeePoints} is null) or (${t.employeeId} is not null and ${t.employeeName} is not null and ${t.employeePoints} is not null and ${t.employeePoints} > 0)`,
    ),
    check(
      'bonus_month_closures_unit_consistent',
      sql`(${t.orgUnitId} is null and ${t.orgUnitName} is null and ${t.orgUnitPoints} is null) or (${t.orgUnitId} is not null and ${t.orgUnitName} is not null and ${t.orgUnitPoints} is not null and ${t.orgUnitPoints} > 0)`,
    ),
    check(
      'bonus_month_closures_masters_array',
      sql`jsonb_typeof(${t.masters}) = 'array' and (${t.orgUnitId} is not null or ${t.masters} = '[]'::jsonb)`,
    ),
    check('bonus_month_closures_rule_version', sql`${t.ruleVersion} = 1`),
  ],
);

/** Shared across sites because compatibility period membership also includes unassigned shifts. */
export const bonusMonthGuards = pgTable(
  'bonus_month_guards',
  {
    month: text('month').primaryKey(),
    revision: bigint('revision', { mode: 'bigint' }).notNull().default(sql`1`),
  },
  (t) => [
    check('bonus_month_guards_month_check', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('bonus_month_guards_revision_check', sql`${t.revision} > 0`),
  ],
);
