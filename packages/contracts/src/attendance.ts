import { z } from 'zod';
import { Base64UrlToken, IdempotencyKey, IsoDateTime, Uuid } from './common.js';

/** Спосіб підтвердження присутності (FR-QR-06, FR-TIME-01). */
export const PresenceMethod = z.enum(['QR', 'TERMINAL', 'MASTER', 'WEB']);
export type PresenceMethod = z.infer<typeof PresenceMethod>;

/** «Я на роботі» після сканування динамічного QR. */
export const ArriveCommand = z.object({
  challengeToken: Base64UrlToken,
  idempotencyKey: IdempotencyKey,
});
export type ArriveCommand = z.infer<typeof ArriveCommand>;

/** «Я пішов». */
export const DepartCommand = ArriveCommand;
export type DepartCommand = z.infer<typeof DepartCommand>;

export const PresenceSessionView = z.object({
  id: Uuid,
  employeeId: Uuid,
  assignmentId: Uuid.nullable(),
  arrivedAt: IsoDateTime,
  departedAt: IsoDateTime.nullable(),
  arrivalMethod: PresenceMethod,
  departureMethod: PresenceMethod.nullable(),
});
export type PresenceSessionView = z.infer<typeof PresenceSessionView>;

/** Відповідь терміналу на запит нового challenge (FR-QR-01). Токен не зберігається в базі. */
export const KioskChallengeResponse = z.object({
  deepLink: z.url(),
  expiresAt: IsoDateTime,
  rotationSeconds: z.number().int().positive(),
  terminalName: z.string(),
});
export type KioskChallengeResponse = z.infer<typeof KioskChallengeResponse>;

/** The kiosk sends the code typed on the tablet; the device token comes back exactly once. */
export const PairTerminalCommand = z.object({
  code: z.string().trim().min(8).max(16),
});
export type PairTerminalCommand = z.infer<typeof PairTerminalCommand>;

export const TerminalPaired = z.object({
  terminalId: Uuid,
  terminalName: z.string(),
  deviceToken: z.string().min(16),
});
export type TerminalPaired = z.infer<typeof TerminalPaired>;
