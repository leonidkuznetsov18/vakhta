import { z } from 'zod';
import { BONUS_CRITERIA } from '@vakhta/domain';
import { BusinessDate, IsoDateTime, ReasonCode, Uuid } from './common.js';

export const BonusScoreStatusSchema = z.enum([
  'PRELIMINARY',
  'PENDING',
  'MANUAL_REVIEW',
  'APPEALED',
  'CONFIRMED',
  'NOT_EVALUATED',
]);
export const CriterionSchema = z.enum(BONUS_CRITERIA);

export const CriterionResultView = z.object({
  criterion: CriterionSchema,
  section: z.string(),
  maxPoints: z.number().int().nonnegative(),
  earnedPoints: z.number().int().nonnegative(),
  status: z.enum(['earned', 'missed', 'not_applicable', 'pending', 'appealed', 'confirmed']),
  basis: z.array(z.string()),
});
export type CriterionResultView = z.infer<typeof CriterionResultView>;

export const AdjustmentView = z.object({
  id: Uuid,
  criterion: CriterionSchema,
  delta: z.number().int(),
  reasonCode: z.string(),
  comment: z.string(),
  authorId: z.string().nullable(),
  status: z.enum(['PENDING_SECOND', 'APPLIED', 'REJECTED']),
  secondApproverId: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AdjustmentView = z.infer<typeof AdjustmentView>;

/** Бали зміни з розшифровкою: працівник бачить підставу кожного зниження (ТЗ 7.1, 7.7). */
export const ShiftScoreView = z.object({
  id: Uuid,
  shiftSessionId: Uuid,
  employeeId: Uuid,
  employeeName: z.string(),
  businessDate: BusinessDate,
  status: BonusScoreStatusSchema,
  score: z.number().int().nullable(),
  earned: z.number().int().nonnegative(),
  applicableMax: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().nonnegative(),
  ruleVersionId: Uuid,
  ruleLabel: z.string(),
  computedAt: IsoDateTime,
  excludedReason: z.string().nullable(),
  criteria: z.array(CriterionResultView),
  adjustments: z.array(AdjustmentView),
});
export type ShiftScoreView = z.infer<typeof ShiftScoreView>;

export const AdjustScoreCommand = z.object({
  criterion: CriterionSchema,
  delta: z.number().int().min(-100).max(100),
  reasonCode: ReasonCode,
  comment: z.string().trim().min(3).max(2000),
});
export type AdjustScoreCommand = z.infer<typeof AdjustScoreCommand>;

export const SecondApprovalCommand = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().min(3).max(2000),
});
export type SecondApprovalCommand = z.infer<typeof SecondApprovalCommand>;

export const BonusMonthQuery = z.object({
  siteId: Uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  employeeId: Uuid.optional(),
});
export type BonusMonthQuery = z.infer<typeof BonusMonthQuery>;

export const EmployeeMonthView = z.object({
  employeeId: Uuid,
  employeeName: z.string(),
  personnelNumber: z.string(),
  shifts: z.number().int().nonnegative(),
  evaluatedShifts: z.number().int().nonnegative(),
  pendingShifts: z.number().int().nonnegative(),
  sMonth: z.number().nullable(),
  weightSum: z.number().nonnegative(),
  baseAmount: z.number().nullable(),
  bonusAmount: z.number().nullable(),
  scores: z.array(ShiftScoreView),
});
export type EmployeeMonthView = z.infer<typeof EmployeeMonthView>;

export const BonusPeriodView = z.object({
  id: Uuid.nullable(),
  siteId: Uuid,
  month: z.string(),
  status: z.enum(['OPEN', 'CLOSING', 'CLOSED']),
  ruleVersionId: Uuid.nullable(),
  ruleLabel: z.string().nullable(),
  closedBy: z.string().nullable(),
  closedAt: IsoDateTime.nullable(),
  employees: z.array(EmployeeMonthView),
  pendingAdjustments: z.array(
    AdjustmentView.extend({ scoreId: Uuid, employeeName: z.string(), businessDate: BusinessDate }),
  ),
  serverTime: IsoDateTime,
});
export type BonusPeriodView = z.infer<typeof BonusPeriodView>;

export const SetBaseAmountsCommand = z.object({
  items: z.array(z.object({ employeeId: Uuid, baseAmount: z.number().nonnegative() })).max(1000),
});
export type SetBaseAmountsCommand = z.infer<typeof SetBaseAmountsCommand>;

export const ClosePeriodCommand = z.object({ comment: z.string().trim().min(3).max(2000) });
export type ClosePeriodCommand = z.infer<typeof ClosePeriodCommand>;

export const BonusRuleVersionView = z.object({
  id: Uuid,
  siteId: Uuid.nullable(),
  label: z.string(),
  validFrom: IsoDateTime,
  isActive: z.boolean(),
  createdBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  rules: z.unknown(),
});
export type BonusRuleVersionView = z.infer<typeof BonusRuleVersionView>;

export const CreateRuleVersionCommand = z.object({
  siteId: Uuid.nullable().optional(),
  label: z.string().trim().min(2).max(100),
  validFrom: IsoDateTime,
  rules: z.unknown(),
});
export type CreateRuleVersionCommand = z.infer<typeof CreateRuleVersionCommand>;

/** Екран балів у боті: останні зміни з розшифровкою й можливістю апеляції (ТЗ 7.7). */
export const MyScoresView = z.object({
  month: z.string(),
  sMonth: z.number().nullable(),
  scores: z.array(ShiftScoreView),
  appealDays: z.number().int().positive(),
});
export type MyScoresView = z.infer<typeof MyScoresView>;
