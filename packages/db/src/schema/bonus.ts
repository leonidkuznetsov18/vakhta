import {
  boolean,
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
import type { BonusRules } from '@vakhta/domain';
import { employees } from './identity.js';
import { sites } from './org.js';
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
    criterion: text('criterion').notNull(),
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
