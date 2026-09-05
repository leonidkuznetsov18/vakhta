import { z } from 'zod';
import { CHECK_IN_FAILURES } from '@vakhta/domain';
import { IsoDateTime, ReasonCode, Uuid } from './common.js';
import { PresenceMethod } from './attendance.js';

export const CheckActionSchema = z.enum(['ARRIVE', 'DEPART']);
export const CheckInFailureSchema = z.enum(CHECK_IN_FAILURES);

export const PresenceView = z.object({
  id: Uuid,
  employeeId: Uuid,
  assignmentId: Uuid.nullable(),
  arrivedAt: IsoDateTime,
  departedAt: IsoDateTime.nullable(),
  arrivalMethod: PresenceMethod,
  departureMethod: PresenceMethod.nullable(),
  status: z.enum(['OPEN', 'CLOSED', 'NEEDS_CLARIFICATION']),
});
export type PresenceView = z.infer<typeof PresenceView>;

/** Результат «Я на роботі» / «Я пішов» (FR-QR-03, FR-UI-02): і успіх, і відмова несуть серверний час. */
export const CheckInResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    action: CheckActionSchema,
    presence: PresenceView,
    /** Повтор того самого challenge тим самим працівником повертає перший результат (T-03). */
    alreadyRecorded: z.boolean(),
    serverTime: IsoDateTime,
    /** null для резервної відмітки майстром. */
    terminalName: z.string().nullable(),
  }),
  z.object({
    ok: z.literal(false),
    action: CheckActionSchema,
    reason: CheckInFailureSchema,
    serverTime: IsoDateTime,
  }),
]);
export type CheckInResult = z.infer<typeof CheckInResult>;

/** Резервна відмітка майстром або через панель (FR-QR-06, ТЗ 6.4). */
export const ReserveCheckInCommand = z.object({
  employeeId: Uuid,
  action: CheckActionSchema,
  /** За замовчуванням зараз; майстер може вказати фактичний час з журналу. */
  at: IsoDateTime.optional(),
  reasonCode: ReasonCode,
  comment: z.string().trim().max(1000).optional(),
});
export type ReserveCheckInCommand = z.infer<typeof ReserveCheckInCommand>;

export const OpenPresenceView = PresenceView.extend({
  fullName: z.string(),
  personnelNumber: z.string(),
});
export type OpenPresenceView = z.infer<typeof OpenPresenceView>;
