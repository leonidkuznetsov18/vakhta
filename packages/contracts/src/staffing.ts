import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';

/** Staffing demand and qualifications (SC-01, SC-04, D-02): effective-dated, audited, per site. */
export const QualificationView = z.object({
  id: Uuid,
  siteId: Uuid,
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});
export type QualificationView = z.infer<typeof QualificationView>;

export const CreateQualificationCommand = z.object({
  siteId: Uuid,
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
});
export type CreateQualificationCommand = z.infer<typeof CreateQualificationCommand>;

export const EmployeeQualificationView = z.object({
  id: Uuid,
  employeeId: Uuid,
  qualificationId: Uuid,
  validFrom: BusinessDate,
  validUntil: BusinessDate.nullable(),
  note: z.string().nullable(),
  recordedAt: IsoDateTime,
});
export type EmployeeQualificationView = z.infer<typeof EmployeeQualificationView>;

export const RecordEmployeeQualificationCommand = z
  .object({
    employeeId: Uuid,
    qualificationId: Uuid,
    validFrom: BusinessDate,
    validUntil: BusinessDate.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((input) => !input.validUntil || input.validUntil >= input.validFrom, {
    path: ['validUntil'],
    message: 'validUntil must not precede validFrom',
  });
export type RecordEmployeeQualificationCommand = z.infer<typeof RecordEmployeeQualificationCommand>;

export const StaffingRequirementView = z.object({
  id: Uuid,
  zoneId: Uuid,
  templateId: Uuid,
  requiredCount: z.number().int().positive(),
  qualificationId: Uuid.nullable(),
  effectiveFrom: BusinessDate,
  effectiveTo: BusinessDate.nullable(),
  note: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type StaffingRequirementView = z.infer<typeof StaffingRequirementView>;

export const SetStaffingRequirementCommand = z
  .object({
    id: Uuid.optional(),
    zoneId: Uuid,
    templateId: Uuid,
    requiredCount: z.number().int().positive().max(200),
    qualificationId: Uuid.nullable().optional(),
    effectiveFrom: BusinessDate,
    effectiveTo: BusinessDate.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((input) => !input.effectiveTo || input.effectiveTo >= input.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'effectiveTo must not precede effectiveFrom',
  });
export type SetStaffingRequirementCommand = z.infer<typeof SetStaffingRequirementCommand>;

export const StaffingQuery = z.object({ siteId: Uuid, orgUnitId: Uuid });
export type StaffingQuery = z.infer<typeof StaffingQuery>;

export const EligibilitySeverity = z.enum(['BLOCK', 'WARN']);

/** Rest and monthly-hour limits of a site (D-03); defaults apply until configured. */
export const SchedulingRulesView = z.object({
  siteId: Uuid,
  minRestMinutes: z.number().int().nonnegative(),
  maxMonthMinutes: z.number().int().positive(),
  restSeverity: EligibilitySeverity,
  hoursSeverity: EligibilitySeverity,
  configured: z.boolean(),
});
export type SchedulingRulesView = z.infer<typeof SchedulingRulesView>;

export const SetSchedulingRulesCommand = z.object({
  siteId: Uuid,
  minRestMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(7 * 24 * 60),
  maxMonthMinutes: z
    .number()
    .int()
    .positive()
    .max(31 * 24 * 60),
  restSeverity: EligibilitySeverity,
  hoursSeverity: EligibilitySeverity,
});
export type SetSchedulingRulesCommand = z.infer<typeof SetSchedulingRulesCommand>;

export const AvailabilityKind = z.enum(['UNAVAILABLE', 'PREFERRED']);
export const EmployeeAvailabilityView = z.object({
  id: Uuid,
  employeeId: Uuid,
  kind: AvailabilityKind,
  weekday: z.number().int().min(0).max(6).nullable(),
  date: BusinessDate.nullable(),
  validFrom: BusinessDate,
  validTo: BusinessDate.nullable(),
  note: z.string().nullable(),
});
export type EmployeeAvailabilityView = z.infer<typeof EmployeeAvailabilityView>;

export const RecordAvailabilityCommand = z
  .object({
    employeeId: Uuid,
    kind: AvailabilityKind,
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    date: BusinessDate.nullable().optional(),
    validFrom: BusinessDate,
    validTo: BusinessDate.nullable().optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((input) => ((input.weekday ?? null) === null) !== ((input.date ?? null) === null), {
    message: 'Either a weekday or a date is required',
    path: ['date'],
  })
  .refine((input) => !input.validTo || input.validTo >= input.validFrom, {
    path: ['validTo'],
    message: 'validTo must not precede validFrom',
  });
export type RecordAvailabilityCommand = z.infer<typeof RecordAvailabilityCommand>;

/** Everything the calendar needs to evaluate the plan locally, including unsaved edits. */
export const StaffingView = z.object({
  requirements: z.array(StaffingRequirementView),
  qualifications: z.array(QualificationView),
  holdings: z.array(EmployeeQualificationView),
  rules: SchedulingRulesView,
  availability: z.array(EmployeeAvailabilityView),
});
export type StaffingView = z.infer<typeof StaffingView>;

/** Planned intervals of the unit's people elsewhere and their absences for one month. */
export const PlanContextQuery = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type PlanContextQuery = z.infer<typeof PlanContextQuery>;

export const ContextInterval = z.object({
  employeeId: Uuid,
  businessDate: BusinessDate,
  startAt: IsoDateTime,
  endAt: IsoDateTime,
  orgUnitId: Uuid,
  status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED']),
});
export type ContextInterval = z.infer<typeof ContextInterval>;

export const AbsenceView = z.object({
  employeeId: Uuid,
  from: BusinessDate,
  to: BusinessDate,
  type: z.string(),
  status: z.enum(['APPROVED', 'PENDING']),
});
export type AbsenceView = z.infer<typeof AbsenceView>;

export const PlanContextView = z.object({
  intervals: z.array(ContextInterval),
  absences: z.array(AbsenceView),
  /** Employees whose current position is in another unit of the site (borrowing candidates). */
  otherUnitEmployees: z.array(z.object({ employeeId: Uuid, orgUnitId: Uuid })),
});
export type PlanContextView = z.infer<typeof PlanContextView>;

export const EligibilityReasonView = z.object({
  code: z.enum([
    'OVERLAP',
    'REST',
    'MONTH_HOURS',
    'ABSENCE',
    'ABSENCE_PENDING',
    'UNAVAILABLE',
    'QUALIFICATION',
  ]),
  severity: EligibilitySeverity,
  employeeId: Uuid,
  businessDate: BusinessDate,
  detail: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type EligibilityReasonView = z.infer<typeof EligibilityReasonView>;

export const CandidatesQuery = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  zoneId: Uuid,
  templateId: Uuid,
  businessDate: BusinessDate,
});
export type CandidatesQuery = z.infer<typeof CandidatesQuery>;

/** A person evaluated for one slot: own-unit people first, blocked reasons kept visible (SC-02). */
export const CandidateView = z.object({
  employeeId: Uuid,
  orgUnitId: Uuid.nullable(),
  ownUnit: z.boolean(),
  status: z.enum(['ELIGIBLE', 'WARNING', 'BLOCKED']),
  reasons: z.array(EligibilityReasonView),
});
export type CandidateView = z.infer<typeof CandidateView>;
