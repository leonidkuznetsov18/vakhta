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

export const AdjustmentStatusSchema = z.enum([
  'PENDING_SECOND',
  'APPLIED',
  'REJECTED',
  'CANCELLED',
]);

export const AdjustmentView = z.object({
  id: Uuid,
  /** null: a plain bonus or penalty on the shift score, not tied to a criterion. */
  criterion: CriterionSchema.nullable(),
  delta: z.number().int(),
  reasonCode: z.string(),
  comment: z.string(),
  authorId: z.string().nullable(),
  status: AdjustmentStatusSchema,
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
  /** Manual review (spec 7.6): the decision of the master when the rules could not score the shift. */
  reviewDecision: z.enum(['SCORE', 'EXCLUDE']).nullable(),
  manualScore: z.number().int().nullable(),
  reviewComment: z.string().nullable(),
  reviewedAt: IsoDateTime.nullable(),
  /** Default for the review dialog: the share of points earned among the criteria that applied. */
  reviewSuggestedScore: z.number().int().nullable(),
  criteria: z.array(CriterionResultView),
  adjustments: z.array(AdjustmentView),
});
export type ShiftScoreView = z.infer<typeof ShiftScoreView>;

/** Points added to or taken from a shift: on the score itself, or on one criterion (advanced). */
export const AdjustScoreCommand = z.object({
  criterion: CriterionSchema.nullable().optional(),
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((d) => d !== 0, { message: 'delta must not be zero' }),
  reasonCode: ReasonCode,
  comment: z.string().trim().min(3).max(2000),
});
export type AdjustScoreCommand = z.infer<typeof AdjustScoreCommand>;

export const UpdateAdjustmentCommand = z.object({
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((d) => d !== 0, { message: 'delta must not be zero' })
    .optional(),
  reasonCode: ReasonCode.optional(),
  comment: z.string().trim().min(3).max(2000).optional(),
});
export type UpdateAdjustmentCommand = z.infer<typeof UpdateAdjustmentCommand>;

export const CancelAdjustmentCommand = z.object({ reason: z.string().trim().min(3).max(2000) });
export type CancelAdjustmentCommand = z.infer<typeof CancelAdjustmentCommand>;

/** Finishes a manual review: a score for the shift, or its exclusion from the month. */
export const ReviewScoreCommand = z
  .object({
    decision: z.enum(['SCORE', 'EXCLUDE']),
    score: z.number().int().min(0).max(100).optional(),
    comment: z.string().trim().min(3).max(2000),
  })
  .refine((c) => c.decision !== 'SCORE' || c.score !== undefined, {
    message: 'score is required for SCORE',
    path: ['score'],
  });
export type ReviewScoreCommand = z.infer<typeof ReviewScoreCommand>;

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

/** Reopen a closed period: scores return to PRELIMINARY so reviews and points can be changed. */
export const ReopenPeriodCommand = z.object({ comment: z.string().trim().min(3).max(2000) });
export type ReopenPeriodCommand = z.infer<typeof ReopenPeriodCommand>;

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
