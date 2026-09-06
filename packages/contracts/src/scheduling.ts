import { z } from 'zod';
import {
  ASSIGNMENT_STATUSES,
  SCHEDULE_STATUSES,
  SHIFT_KINDS,
  VALIDATION_ISSUE_CODES,
} from '@vakhta/domain';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';

export const ScheduleStatusSchema = z.enum(SCHEDULE_STATUSES);
export const ShiftKindSchema = z.enum(SHIFT_KINDS);
export const AssignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export const ValidationIssueCodeSchema = z.enum(VALIDATION_ISSUE_CODES);

/** 'YYYY-MM' */
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const CreateShiftTemplateCommand = z.object({
  siteId: Uuid,
  code: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().trim().min(1).max(100),
  localStart: LocalTime,
  localEnd: LocalTime,
  isNight: z.boolean().default(false),
});
export type CreateShiftTemplateCommand = z.infer<typeof CreateShiftTemplateCommand>;

export const ShiftTemplateView = z.object({
  id: Uuid,
  siteId: Uuid,
  code: z.string(),
  name: z.string(),
  localStart: LocalTime,
  localEnd: LocalTime,
  isNight: z.boolean(),
  isActive: z.boolean(),
});
export type ShiftTemplateView = z.infer<typeof ShiftTemplateView>;

/** Нова версія: порожня або копія вказаної чи чинної опублікованої (ТЗ 3.1). */
export const CreateScheduleVersionCommand = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  basedOnVersionId: Uuid.optional(),
});
export type CreateScheduleVersionCommand = z.infer<typeof CreateScheduleVersionCommand>;

export const AssignmentInput = z.object({
  employeeId: Uuid,
  templateId: Uuid,
  businessDate: BusinessDate,
  positionId: Uuid.optional(),
  teamId: Uuid.optional(),
  zoneId: Uuid.optional(),
  kind: ShiftKindSchema.default('REGULAR'),
});
export type AssignmentInput = z.infer<typeof AssignmentInput>;

/** Повна заміна призначень чернетки: планувальник надсилає весь місяць. */
export const PutAssignmentsCommand = z.object({
  items: z.array(AssignmentInput).max(5000),
});
export type PutAssignmentsCommand = z.infer<typeof PutAssignmentsCommand>;

export const ReturnToDraftCommand = z.object({ comment: z.string().trim().min(3).max(1000) });
export type ReturnToDraftCommand = z.infer<typeof ReturnToDraftCommand>;

export const PublishScheduleCommand = z.object({
  changeReason: z.string().trim().max(1000).optional(),
});
export type PublishScheduleCommand = z.infer<typeof PublishScheduleCommand>;

export const ScheduleVersionView = z.object({
  id: Uuid,
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  versionNo: z.number().int().positive(),
  status: ScheduleStatusSchema,
  createdBy: Uuid.nullable(),
  submittedAt: IsoDateTime.nullable(),
  approvedBy: Uuid.nullable(),
  publishedAt: IsoDateTime.nullable(),
  supersedesId: Uuid.nullable(),
  changeReason: z.string().nullable(),
  createdAt: IsoDateTime,
  assignmentsCount: z.number().int().nonnegative(),
});
export type ScheduleVersionView = z.infer<typeof ScheduleVersionView>;

export const AssignmentView = z.object({
  id: Uuid,
  scheduleVersionId: Uuid,
  employeeId: Uuid,
  templateId: Uuid,
  templateCode: z.string(),
  businessDate: BusinessDate,
  planStartAt: IsoDateTime,
  planEndAt: IsoDateTime,
  positionId: Uuid.nullable(),
  orgUnitId: Uuid,
  teamId: Uuid.nullable(),
  zoneId: Uuid.nullable(),
  kind: ShiftKindSchema,
  status: AssignmentStatusSchema,
  acknowledgedAt: IsoDateTime.nullable(),
});
export type AssignmentView = z.infer<typeof AssignmentView>;

export const ValidationIssueView = z.object({
  code: ValidationIssueCodeSchema,
  severity: z.enum(['ERROR', 'WARNING']),
  employeeId: Uuid,
  assignmentIds: z.array(Uuid),
  details: z.record(z.string(), z.union([z.number(), z.string()])),
});
export type ValidationIssueView = z.infer<typeof ValidationIssueView>;

export const ScheduleVersionDetail = z.object({
  version: ScheduleVersionView,
  assignments: z.array(AssignmentView),
  issues: z.array(ValidationIssueView),
});
export type ScheduleVersionDetail = z.infer<typeof ScheduleVersionDetail>;

/** Хто ознайомився з опублікованою версією (FR-SCH-03, ТЗ 10). */
export const AcknowledgementStatusView = z.object({
  employeeId: Uuid,
  fullName: z.string(),
  personnelNumber: z.string(),
  assignments: z.number().int().nonnegative(),
  acknowledged: z.number().int().nonnegative(),
  telegramLinked: z.boolean(),
});
export type AcknowledgementStatusView = z.infer<typeof AcknowledgementStatusView>;

export const RemindResult = z.object({ reminded: z.number().int().nonnegative() });
export type RemindResult = z.infer<typeof RemindResult>;

/** «Мій план» для бота і /me (FR-SCH-01/02). */
export const MyPlanDay = z.object({
  date: BusinessDate,
  weekday: z.number().int().min(1).max(7),
  kind: z.enum(['DAY', 'NIGHT', 'OFF']),
  assignment: z
    .object({
      id: Uuid,
      versionId: Uuid,
      planStartAt: IsoDateTime,
      planEndAt: IsoDateTime,
      templateCode: z.string(),
      zoneName: z.string().nullable(),
      orgUnitName: z.string(),
      acknowledged: z.boolean(),
    })
    .nullable(),
});

export const MyPlanView = z.object({
  month: Month,
  timezone: z.string(),
  days: z.array(MyPlanDay),
  totals: z.object({
    shifts: z.number().int().nonnegative(),
    plannedMinutes: z.number().int().nonnegative(),
    dayShifts: z.number().int().nonnegative(),
    nightShifts: z.number().int().nonnegative(),
  }),
  /** Опубліковані версії, з якими працівник ще не ознайомився. */
  unacknowledgedVersionIds: z.array(Uuid),
});
export type MyPlanView = z.infer<typeof MyPlanView>;
