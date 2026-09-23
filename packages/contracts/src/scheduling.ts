import { z } from 'zod';
import {
  ASSIGNMENT_STATUSES,
  SCHEDULE_STATUSES,
  SHIFT_KINDS,
  SHIFT_PERIODS,
  templateHoursIssue,
} from '@vakhta/domain';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';

export const ScheduleStatusSchema = z.enum(SCHEDULE_STATUSES);
export const ShiftKindSchema = z.enum(SHIFT_KINDS);
export const AssignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export const ShiftPeriodSchema = z.enum(SHIFT_PERIODS);

/** 'YYYY-MM' */
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const TemplateHours = z.object({
  period: ShiftPeriodSchema,
  localStart: LocalTime,
  localEnd: LocalTime,
});

/** Full day lasts exactly 24 hours; the issue code is the message clients localize. */
function checkTemplateHours(value: z.infer<typeof TemplateHours>, ctx: z.RefinementCtx): void {
  const issue = templateHoursIssue(value.period, value);
  if (issue) ctx.addIssue({ code: 'custom', path: ['localEnd'], message: issue });
}

/** A site default template (spec 18 item 3); unit shifts use the unit command. */
export const CreateShiftTemplateCommand = TemplateHours.extend({
  siteId: Uuid,
  code: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().trim().min(1).max(100),
}).superRefine(checkTemplateHours);
export type CreateShiftTemplateCommand = z.infer<typeof CreateShiftTemplateCommand>;

/** An unnamed unit shift is known by its hours. */
export const UNIT_SHIFT_NAME_MAX = 60;
const UnitShiftFields = TemplateHours.extend({
  name: z.string().trim().max(UNIT_SHIFT_NAME_MAX),
});

export const CreateUnitShiftCommand = UnitShiftFields.superRefine(checkTemplateHours);
export type CreateUnitShiftCommand = z.infer<typeof CreateUnitShiftCommand>;

export const UpdateUnitShiftCommand = UnitShiftFields.extend({
  revision: z.number().int().positive(),
}).superRefine(checkTemplateHours);
export type UpdateUnitShiftCommand = z.infer<typeof UpdateUnitShiftCommand>;

export const DeleteUnitShiftQuery = z.object({ revision: z.coerce.number().int().positive() });
export type DeleteUnitShiftQuery = z.infer<typeof DeleteUnitShiftQuery>;

export const ShiftTemplatesQuery = z.object({
  siteId: Uuid,
  /** Adds that unit's current shifts to the site defaults. */
  orgUnitId: Uuid.optional(),
  /** Also returns retired versions, so planned history keeps its labels. */
  includeRetired: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ShiftTemplatesQuery = z.infer<typeof ShiftTemplatesQuery>;

export const ShiftTemplateView = z.object({
  id: Uuid,
  siteId: Uuid,
  /** Null for a site default offered to every unit. */
  orgUnitId: Uuid.nullable(),
  code: z.string(),
  name: z.string(),
  localStart: LocalTime,
  localEnd: LocalTime,
  period: ShiftPeriodSchema,
  isActive: z.boolean(),
  revision: z.number().int().positive(),
  retiredAt: IsoDateTime.nullable(),
  /** The version that took over after an hours edit; null when deleted or current. */
  replacedById: Uuid.nullable(),
  /** Assignments planned with this version. */
  usedCount: z.number().int().nonnegative(),
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

/** One zone part of a shift (SC-37); parts tile the planned interval in order. */
export const AssignmentSegmentInput = z.object({
  zoneId: Uuid,
  localStart: LocalTime,
  localEnd: LocalTime,
});
export type AssignmentSegmentInput = z.infer<typeof AssignmentSegmentInput>;

/** One planned break inside a shift (SC-36), optionally relieved by another planned worker. */
export const AssignmentBreakInput = z.object({
  localStart: LocalTime,
  localEnd: LocalTime,
  reliefEmployeeId: Uuid.nullable().optional(),
});
export type AssignmentBreakInput = z.infer<typeof AssignmentBreakInput>;

export const AssignmentInput = z
  .object({
    employeeId: Uuid,
    templateId: Uuid,
    businessDate: BusinessDate,
    positionId: Uuid.optional(),
    teamId: Uuid.optional(),
    zoneId: Uuid.optional(),
    kind: ShiftKindSchema.default('REGULAR'),
    /** Custom local start/end replacing the template times (SC-32); both or neither. */
    customStart: LocalTime.optional(),
    customEnd: LocalTime.optional(),
    segments: z.array(AssignmentSegmentInput).max(8).optional(),
    breaks: z.array(AssignmentBreakInput).max(8).optional(),
  })
  .refine((input) => (input.customStart === undefined) === (input.customEnd === undefined), {
    path: ['customEnd'],
    message: 'customStart and customEnd go together',
  });
export type AssignmentInput = z.infer<typeof AssignmentInput>;

export const AssignmentSegmentView = z.object({
  id: Uuid,
  position: z.number().int().nonnegative(),
  zoneId: Uuid,
  localStart: LocalTime,
  localEnd: LocalTime,
});
export type AssignmentSegmentView = z.infer<typeof AssignmentSegmentView>;

export const AssignmentBreakView = z.object({
  id: Uuid,
  position: z.number().int().nonnegative(),
  localStart: LocalTime,
  localEnd: LocalTime,
  reliefEmployeeId: Uuid.nullable(),
});
export type AssignmentBreakView = z.infer<typeof AssignmentBreakView>;

/** Required at public mutation boundaries; domain-owned workflows use their owning transaction. */
export const ScheduleRevisionPrecondition = z.object({
  expectedRevision: z.number().int().positive(),
});
export type ScheduleRevisionPrecondition = z.infer<typeof ScheduleRevisionPrecondition>;

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

/**
 * Edit a published month in place: the items become a new version that is published at once,
 * the current one is superseded and employees are notified of the difference.
 */
export const ReviseScheduleCommand = z.object({
  items: z.array(AssignmentInput).max(5000),
  changeReason: z.string().trim().max(1000).optional(),
});
export type ReviseScheduleCommand = z.infer<typeof ReviseScheduleCommand>;

export const ScheduleVersionView = z.object({
  id: Uuid,
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  versionNo: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: ScheduleStatusSchema,
  createdBy: Uuid.nullable(),
  submittedAt: IsoDateTime.nullable(),
  approvedBy: Uuid.nullable(),
  publishedAt: IsoDateTime.nullable(),
  supersedesId: Uuid.nullable(),
  changeReason: z.string().nullable(),
  createdAt: IsoDateTime,
  assignmentsCount: z.number().int().nonnegative(),
  /** True for a draft, and for a superseded version no shift was worked against. */
  deletable: z.boolean(),
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
  customStart: LocalTime.nullable().default(null),
  customEnd: LocalTime.nullable().default(null),
  segments: z.array(AssignmentSegmentView).default([]),
  breaks: z.array(AssignmentBreakView).default([]),
});
export type AssignmentView = z.infer<typeof AssignmentView>;

export const ScheduleVersionDetail = z.object({
  version: ScheduleVersionView,
  assignments: z.array(AssignmentView),
});
export type ScheduleVersionDetail = z.infer<typeof ScheduleVersionDetail>;

/** Additive web boundary: preserve one command ID and payload until its outcome is known. */
const ExistingScheduleCommand = {
  commandId: Uuid,
  versionId: Uuid,
  ...ScheduleRevisionPrecondition.shape,
};
export const ScheduleWebCommand = z.discriminatedUnion('action', [
  z.object({ commandId: Uuid, action: z.literal('CREATE'), payload: CreateScheduleVersionCommand }),
  z.object({
    ...ExistingScheduleCommand,
    action: z.literal('SAVE'),
    payload: PutAssignmentsCommand,
  }),
  z.object({ ...ExistingScheduleCommand, action: z.literal('SUBMIT') }),
  z.object({
    ...ExistingScheduleCommand,
    action: z.literal('RETURN'),
    payload: ReturnToDraftCommand,
  }),
  z.object({
    ...ExistingScheduleCommand,
    action: z.literal('PUBLISH'),
    payload: PublishScheduleCommand,
  }),
  z.object({
    ...ExistingScheduleCommand,
    action: z.literal('REVISE'),
    payload: ReviseScheduleCommand,
  }),
  z.object({ ...ExistingScheduleCommand, action: z.literal('DELETE') }),
]);
export type ScheduleWebCommand = z.infer<typeof ScheduleWebCommand>;

export const ScheduleCommandResult = z.discriminatedUnion('kind', [
  z.object({ commandId: Uuid, kind: z.literal('VERSION'), version: ScheduleVersionView }),
  z.object({ commandId: Uuid, kind: z.literal('DETAIL'), detail: ScheduleVersionDetail }),
  z.object({ commandId: Uuid, kind: z.literal('DELETED'), versionId: Uuid }),
]);
export type ScheduleCommandResult = z.infer<typeof ScheduleCommandResult>;

/** «Мій план» для бота і /me (FR-SCH-01/02). */
export const MyPlanDay = z.object({
  date: BusinessDate,
  weekday: z.number().int().min(1).max(7),
  kind: z.enum([...SHIFT_PERIODS, 'OFF']),
  assignment: z
    .object({
      id: Uuid,
      versionId: Uuid,
      planStartAt: IsoDateTime,
      planEndAt: IsoDateTime,
      templateCode: z.string(),
      zoneName: z.string().nullable(),
      orgUnitName: z.string(),
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
    fullDayShifts: z.number().int().nonnegative(),
  }),
  /** Notes addressed to employees (SC-39): month-wide or per date. */
  notes: z.array(z.object({ date: BusinessDate.nullable(), text: z.string() })).default([]),
});
export type MyPlanView = z.infer<typeof MyPlanView>;

export const ScheduleHistoryQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ScheduleHistoryQuery = z.infer<typeof ScheduleHistoryQuery>;

const ScheduleHistoryIdentity = z.object({
  id: Uuid,
  at: IsoDateTime,
  actorType: z.enum(['EMPLOYEE', 'WEB_USER', 'SYSTEM', 'TERMINAL']),
  actorId: Uuid.nullable(),
  /** Current directory label, not a historical name snapshot. */
  actorLabel: z.string().nullable(),
  reason: z.string().nullable(),
});

export const ScheduleHistoryEntry = z.discriminatedUnion('action', [
  ScheduleHistoryIdentity.extend({
    action: z.literal('CREATE'),
    basedOnVersionId: Uuid.nullable(),
  }).strict(),
  ScheduleHistoryIdentity.extend({
    action: z.literal('SAVE'),
    assignmentCount: z.number().int().nonnegative().nullable(),
  }).strict(),
  ScheduleHistoryIdentity.extend({
    action: z.enum(['SUBMIT', 'RETURN', 'PUBLISH']),
    fromStatus: ScheduleStatusSchema.nullable(),
    toStatus: ScheduleStatusSchema.nullable(),
  }).strict(),
  ScheduleHistoryIdentity.extend({
    action: z.literal('REMIND'),
    reminded: z.number().int().nonnegative().nullable(),
    pending: z.number().int().nonnegative().nullable(),
  }).strict(),
]);
export type ScheduleHistoryEntry = z.infer<typeof ScheduleHistoryEntry>;

const ScheduleHistoryVersionReference = z
  .object({ id: Uuid, versionNo: z.number().int().positive() })
  .strict();
export const ScheduleHistoryPage = z
  .object({
    versionId: Uuid,
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    entries: z.array(ScheduleHistoryEntry),
    lineage: z
      .object({
        supersedes: ScheduleHistoryVersionReference.nullable(),
        supersededBy: ScheduleHistoryVersionReference.nullable(),
      })
      .strict(),
  })
  .strict();
export type ScheduleHistoryPage = z.infer<typeof ScheduleHistoryPage>;

/** Complete saved-version XLSX only; calendar filters and pagination are not export parameters. */
export const ScheduleExportQuery = z
  .object({
    expectedRevision: z.coerce.number().int().positive(),
  })
  .strict();
export type ScheduleExportQuery = z.infer<typeof ScheduleExportQuery>;

/** A reusable batch input (SC-26): the rotation or single template, existing-date mode and zone. */
export const PatternDefinition = z.object({
  pattern: z.enum([
    'SINGLE',
    'DAY_2_2',
    'NIGHT_2_2',
    'DAY_4_2',
    'NIGHT_4_2',
    'DAY_NIGHT_OFF_OFF',
    'WEEKDAYS_DAY',
  ]),
  templateId: Uuid.nullable(),
  mode: z.enum(['fill', 'replace']),
  zoneId: Uuid.nullable(),
});
export type PatternDefinition = z.infer<typeof PatternDefinition>;

export const SchedulePatternView = z.object({
  id: Uuid,
  siteId: Uuid,
  name: z.string(),
  definition: PatternDefinition,
  createdAt: IsoDateTime,
});
export type SchedulePatternView = z.infer<typeof SchedulePatternView>;

export const SavePatternCommand = z.object({
  siteId: Uuid,
  name: z.string().trim().min(1).max(80),
  definition: PatternDefinition,
});
export type SavePatternCommand = z.infer<typeof SavePatternCommand>;
