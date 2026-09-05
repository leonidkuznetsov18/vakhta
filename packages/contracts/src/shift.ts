import { z } from 'zod';
import { RESUMABLE_STATES, SHIFT_ACTIONS, SHIFT_STATES } from '@vakhta/domain';
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

export const ShiftSessionView = z.object({
  id: Uuid,
  employeeId: Uuid,
  assignmentId: Uuid,
  businessDate: BusinessDate,
  state: ShiftStateSchema,
  resumeState: ResumableStateSchema.nullable(),
  version: ExpectedVersion,
  startedAt: IsoDateTime.nullable(),
  endedAt: IsoDateTime.nullable(),
  needsClarification: z.boolean(),
});
export type ShiftSessionView = z.infer<typeof ShiftSessionView>;

/** Відповідь на команду: і успіх, і відмова повертають актуальний стан (FR-UI-02, T-09). */
export const TransitionResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), session: ShiftSessionView, serverTime: IsoDateTime }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    session: ShiftSessionView,
    serverTime: IsoDateTime,
  }),
]);
export type TransitionResponse = z.infer<typeof TransitionResponse>;
