import { z } from 'zod';
import { REQUEST_STATUSES, REQUEST_TYPES, SHIFT_STATES } from '@vakhta/domain';
import { BusinessDate, Comment, IdempotencyKey, IsoDateTime, ReasonCode, Uuid } from './common.js';

export const RequestTypeSchema = z.enum(REQUEST_TYPES);
export const RequestStatusSchema = z.enum(REQUEST_STATUSES);

const Text = z.string().trim().min(3).max(2000);
const Photo = z.object({
  telegramFileId: z.string().min(1).max(200),
  telegramFileUniqueId: z.string().min(1).max(200),
});

/** Пропозиція корекції (FR-COR-03): зсув межі інтервалу, перекласифікація або час закриття. */
export const CorrectionProposalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MOVE_BOUNDARY'), intervalId: Uuid, newStartedAt: IsoDateTime }),
  z.object({ kind: z.literal('RECLASSIFY'), intervalId: Uuid, newState: z.enum(SHIFT_STATES) }),
  z.object({ kind: z.literal('CLOSE_SHIFT_AT'), endedAt: IsoDateTime }),
]);
export type CorrectionProposalCommand = z.infer<typeof CorrectionProposalSchema>;

/** Створення звернення: обовʼязкові поля залежать від типу (FR-REQ-01). */
export const CreateRequestCommand = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['VACATION', 'DAY_OFF']),
    periodFrom: BusinessDate,
    periodTo: BusinessDate,
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.literal('SICK'),
    periodFrom: BusinessDate,
    periodTo: BusinessDate,
    comment: Comment.optional(),
    medicalPhoto: Photo.optional(),
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.literal('SWAP'),
    assignmentId: Uuid,
    counterpartEmployeeId: Uuid,
    counterpartAssignmentId: Uuid,
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.literal('EXTRA_SHIFT'),
    businessDate: BusinessDate,
    templateId: Uuid,
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.literal('CANNOT_ATTEND'),
    assignmentId: Uuid,
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.enum(['LATE', 'EARLY_LEAVE']),
    assignmentId: Uuid,
    minutes: z.number().int().positive().max(720),
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
  z.object({ type: z.literal('TECH_ISSUE'), comment: Text, idempotencyKey: IdempotencyKey }),
  z.object({
    type: z.literal('CORRECTION'),
    shiftSessionId: Uuid,
    reasonCode: ReasonCode,
    comment: Text,
    proposal: CorrectionProposalSchema.optional(),
    evidencePhoto: Photo.optional(),
    idempotencyKey: IdempotencyKey,
  }),
  z.object({
    type: z.literal('APPEAL'),
    shiftSessionId: Uuid,
    scoreId: Uuid.optional(),
    comment: Text,
    idempotencyKey: IdempotencyKey,
  }),
]);
export type CreateRequestCommand = z.infer<typeof CreateRequestCommand>;

export const DecideRequestCommand = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: Text,
  /** Для LATE/EARLY_LEAVE керівник може затвердити інший допустимий час (ТЗ 7.3). */
  approvedMinutes: z.number().int().nonnegative().max(720).optional(),
  /** Для CORRECTION майстер може уточнити пропозицію перед застосуванням. */
  proposal: CorrectionProposalSchema.optional(),
});
export type DecideRequestCommand = z.infer<typeof DecideRequestCommand>;

export const RequestDecisionView = z.object({
  id: Uuid,
  step: z.number().int().nonnegative(),
  stepKey: z.string(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  actingRole: z.string().nullable(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string(),
  at: IsoDateTime,
});
export type RequestDecisionView = z.infer<typeof RequestDecisionView>;

export const RequestView = z.object({
  id: Uuid,
  type: RequestTypeSchema,
  status: RequestStatusSchema,
  employeeId: Uuid,
  employeeName: z.string(),
  currentStep: z.number().int().nonnegative(),
  currentStepKey: z.string().nullable(),
  totalSteps: z.number().int().positive(),
  periodFrom: BusinessDate.nullable(),
  periodTo: BusinessDate.nullable(),
  assignmentId: Uuid.nullable(),
  assignmentDate: BusinessDate.nullable(),
  counterpartEmployeeId: Uuid.nullable(),
  counterpartName: z.string().nullable(),
  shiftSessionId: Uuid.nullable(),
  comment: z.string().nullable(),
  minutes: z.number().int().nullable(),
  approvedMinutes: z.number().int().nullable(),
  /** Є медичний документ; сам документ лише для HR (FR-REQ-02). */
  hasMedicalDocument: z.boolean(),
  medicalMediaId: Uuid.nullable(),
  submittedAt: IsoDateTime,
  stepDeadlineAt: IsoDateTime.nullable(),
  decidedAt: IsoDateTime.nullable(),
  resultVersionId: Uuid.nullable(),
  overdue: z.boolean(),
});
export type RequestView = z.infer<typeof RequestView>;

export const RequestDetailView = z.object({
  request: RequestView,
  decisions: z.array(RequestDecisionView),
  serverTime: IsoDateTime,
});
export type RequestDetailView = z.infer<typeof RequestDetailView>;

export const RequestsQuery = z.object({
  /** inbox: чекають рішення актора; all: усі з фільтрами. */
  scope: z.enum(['inbox', 'all']).optional(),
  status: RequestStatusSchema.optional(),
  type: RequestTypeSchema.optional(),
  employeeId: Uuid.optional(),
});
export type RequestsQuery = z.infer<typeof RequestsQuery>;

export const OvertimeView = z.object({
  id: Uuid.nullable(),
  shiftSessionId: Uuid,
  employeeId: Uuid,
  employeeName: z.string(),
  businessDate: BusinessDate,
  minutes: z.number().int().nonnegative(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  decidedBy: z.string().nullable(),
  comment: z.string().nullable(),
  decidedAt: IsoDateTime.nullable(),
});
export type OvertimeView = z.infer<typeof OvertimeView>;

export const DecideOvertimeCommand = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: Text,
});
export type DecideOvertimeCommand = z.infer<typeof DecideOvertimeCommand>;

/** Майстер застосовує корекцію напряму (матриця ТЗ 2.1: створює майстер, підтверджує майстер). */
export const ApplyCorrectionCommand = z.object({
  proposal: CorrectionProposalSchema,
  reasonCode: ReasonCode,
  comment: Text,
  requestId: Uuid.optional(),
});
export type ApplyCorrectionCommand = z.infer<typeof ApplyCorrectionCommand>;

export const CorrectionResultView = z.object({
  compensatingEventId: Uuid,
  changes: z.array(
    z.object({
      intervalId: Uuid,
      before: z.object({
        state: z.string(),
        startedAt: IsoDateTime,
        endedAt: IsoDateTime.nullable(),
      }),
      after: z.object({
        state: z.string(),
        startedAt: IsoDateTime,
        endedAt: IsoDateTime.nullable(),
      }),
    }),
  ),
});
export type CorrectionResultView = z.infer<typeof CorrectionResultView>;

export const RequestChangedEvent = z.object({
  requestId: Uuid,
  status: RequestStatusSchema,
  at: IsoDateTime,
});
export type RequestChangedEvent = z.infer<typeof RequestChangedEvent>;
