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

/** Everything the calendar needs to compute coverage locally, including unsaved edits. */
export const StaffingView = z.object({
  requirements: z.array(StaffingRequirementView),
  qualifications: z.array(QualificationView),
  holdings: z.array(EmployeeQualificationView),
});
export type StaffingView = z.infer<typeof StaffingView>;
