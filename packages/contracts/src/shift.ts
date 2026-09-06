import { z } from 'zod';
import { COMMAND_ERROR_CODES, RESUMABLE_STATES, SHIFT_ACTIONS, SHIFT_STATES } from '@vakhta/domain';
import {
  BusinessDate,
  Comment,
  ExpectedVersion,
  IdempotencyKey,
  IsoDateTime,
  ReasonCode,
  Uuid,
} from './common.js';

export const ShiftActionSchema = z.enum(SHIFT_ACTIONS);
export const ShiftStateSchema = z.enum(SHIFT_STATES);
export const ResumableStateSchema = z.enum(RESUMABLE_STATES);

/** Команда переходу стану: одна для всіх кнопок бота і дій панелі (документ 3.7). */
export const TransitionCommand = z.object({
  shiftSessionId: Uuid,
  action: ShiftActionSchema,
  expectedVersion: ExpectedVersion,
  idempotencyKey: IdempotencyKey,
  reasonCode: ReasonCode.optional(),
  comment: Comment.optional(),
  /** FR-DWN-06: після обіду перешкода триває. */
  resumeIntoDowntime: z.boolean().optional(),
});
export type TransitionCommand = z.infer<typeof TransitionCommand>;

/** «Почати зміну» з бота: сесія створюється за відкритою присутністю працівника. */
export const StartShiftCommand = z.object({
  idempotencyKey: IdempotencyKey,
  comment: Comment.optional(),
});
export type StartShiftCommand = z.infer<typeof StartShiftCommand>;

/** Дія майстра з панелі: коментар обовʼязковий, бо це ручне втручання (FR-COR-04). */
export const MasterTransitionCommand = z.object({
  action: ShiftActionSchema,
  expectedVersion: ExpectedVersion,
  idempotencyKey: IdempotencyKey,
  reasonCode: ReasonCode.optional(),
  comment: z.string().trim().min(3).max(2000),
  resumeIntoDowntime: z.boolean().optional(),
});
export type MasterTransitionCommand = z.infer<typeof MasterTransitionCommand>;

/** Майстер відкриває зміну працівнику, який не може зробити це сам (резервний канал). */
export const MasterStartShiftCommand = z.object({
  employeeId: Uuid,
  idempotencyKey: IdempotencyKey,
  comment: z.string().trim().min(3).max(2000),
  /** Zone the employee cleans and hands over when no schedule assignment provides one. */
  zoneId: Uuid.optional(),
});
export type MasterStartShiftCommand = z.infer<typeof MasterStartShiftCommand>;

export const ClarifyShiftCommand = z.object({ reason: z.string().trim().min(3).max(1000) });
export type ClarifyShiftCommand = z.infer<typeof ClarifyShiftCommand>;

export const ShiftSessionView = z.object({
  id: Uuid,
  employeeId: Uuid,
  assignmentId: Uuid.nullable(),
  businessDate: BusinessDate,
  state: ShiftStateSchema,
  resumeState: ResumableStateSchema.nullable(),
  version: ExpectedVersion,
  startedAt: IsoDateTime.nullable(),
  endedAt: IsoDateTime.nullable(),
  /** З якого моменту триває поточний стан. */
  stateSince: IsoDateTime.nullable(),
  planStartAt: IsoDateTime.nullable(),
  planEndAt: IsoDateTime.nullable(),
  zoneId: Uuid.nullable(),
  zoneName: z.string().nullable(),
  zoneAccepted: z.boolean(),
  needsClarification: z.boolean(),
  clarificationReason: z.string().nullable(),
});
export type ShiftSessionView = z.infer<typeof ShiftSessionView>;

export const ShiftSummaryView = z.object({
  totalMinutes: z.number().int().nonnegative(),
  workMinutes: z.number().int().nonnegative(),
  preparationMinutes: z.number().int().nonnegative(),
  serviceMinutes: z.number().int().nonnegative(),
  breakMinutes: z.number().int().nonnegative(),
  mealMinutes: z.number().int().nonnegative(),
  downtimeMinutes: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().nonnegative().nullable(),
  lateMinutes: z.number().int().nonnegative(),
  earlyLeaveMinutes: z.number().int().nonnegative(),
  overtimeMinutes: z.number().int().nonnegative(),
  overtimePending: z.boolean(),
});
export type ShiftSummaryView = z.infer<typeof ShiftSummaryView>;

export const TransitionErrorSchema = z.enum(COMMAND_ERROR_CODES);
export type TransitionError = z.infer<typeof TransitionErrorSchema>;

/** Відповідь на команду: і успіх, і відмова повертають актуальний стан (FR-UI-02, T-09). */
export const TransitionResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    session: ShiftSessionView,
    summary: ShiftSummaryView.nullable(),
    /** true, якщо команда з тим самим ключем уже виконувалась. */
    replayed: z.boolean(),
    serverTime: IsoDateTime,
  }),
  z.object({
    ok: z.literal(false),
    error: TransitionErrorSchema,
    session: ShiftSessionView.nullable(),
    serverTime: IsoDateTime,
  }),
]);
export type TransitionResponse = z.infer<typeof TransitionResponse>;

export const ReasonOption = z.object({ code: ReasonCode, label: z.string() });
export type ReasonOption = z.infer<typeof ReasonOption>;

/** Екран зміни в боті рендериться сервером зі стану (ADR-11, FR-UI-01). */
export const ShiftScreenView = z.object({
  session: ShiftSessionView.nullable(),
  presenceOpen: z.boolean(),
  allowedActions: z.array(ShiftActionSchema),
  canAcceptZone: z.boolean(),
  /** FR-DWN-06: обід або перерва відкриті з простою, при поверненні спитати, чи перешкода триває. */
  offerResumeIntoDowntime: z.boolean(),
  /** Передачі, що чекають перевірки зони цією зміною (FR-HND-03); заповнює шар бота. */
  pendingHandovers: z.number().int().nonnegative(),
  downtimeReasons: z.array(ReasonOption),
  emergencyReasons: z.array(ReasonOption),
  summary: ShiftSummaryView.nullable(),
  timezone: z.string(),
  serverTime: IsoDateTime,
});
export type ShiftScreenView = z.infer<typeof ShiftScreenView>;

export const ActivityIntervalView = z.object({
  id: Uuid,
  state: ShiftStateSchema,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  resumeState: ResumableStateSchema.nullable(),
  reasonCode: z.string().nullable(),
});
export type ActivityIntervalView = z.infer<typeof ActivityIntervalView>;

/** Рядок оперативного екрана (ТЗ 9.2). */
export const ActiveShiftView = ShiftSessionView.extend({
  fullName: z.string(),
  personnelNumber: z.string(),
  orgUnitName: z.string().nullable(),
  presenceSince: IsoDateTime.nullable(),
  /** Скільки хвилин триває поточний стан на момент serverTime. */
  stateMinutes: z.number().int().nonnegative(),
});
export type ActiveShiftView = z.infer<typeof ActiveShiftView>;

export const ShiftEventView = z.object({
  id: Uuid,
  type: z.string(),
  occurredAt: IsoDateTime,
  actorType: z.string().nullable(),
  reasonCode: z.string().nullable(),
  comment: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type ShiftEventView = z.infer<typeof ShiftEventView>;

export const ShiftDetailView = z.object({
  session: ActiveShiftView,
  intervals: z.array(ActivityIntervalView),
  summary: ShiftSummaryView.nullable(),
  events: z.array(ShiftEventView),
  serverTime: IsoDateTime,
});
export type ShiftDetailView = z.infer<typeof ShiftDetailView>;

export const ActiveShiftsQuery = z.object({
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
  /** Показати і закриті сьогодні. */
  includeClosed: z.coerce.boolean().optional(),
});
export type ActiveShiftsQuery = z.infer<typeof ActiveShiftsQuery>;

/** Подія для SSE оперативного екрана: панель перечитує список. */
export const ChangeSourceSchema = z.enum(['TELEGRAM', 'WEB', 'TERMINAL', 'SYSTEM', 'INTEGRATION']);
export type ChangeSource = z.infer<typeof ChangeSourceSchema>;

export const ShiftChangedEvent = z.object({
  sessionId: Uuid,
  employeeId: Uuid,
  state: ShiftStateSchema,
  version: ExpectedVersion,
  at: IsoDateTime,
  /** Who caused the change; the bot redraws its own screen only for changes made elsewhere. */
  source: ChangeSourceSchema.optional(),
});
export type ShiftChangedEvent = z.infer<typeof ShiftChangedEvent>;
