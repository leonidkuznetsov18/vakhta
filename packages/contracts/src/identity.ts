import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

export const EmployeeStatusSchema = z.enum(['ACTIVE', 'BLOCKED', 'TERMINATED']);

/** Табельний номер: як у кадровій системі, без пробілів по краях. */
export const PersonnelNumber = z.string().trim().min(1).max(32);

/** HR або адміністратор створює картку до активації (ТЗ 2.2). */
export const CreateEmployeeCommand = z.object({
  personnelNumber: PersonnelNumber,
  fullName: z.string().trim().min(3).max(200),
  status: EmployeeStatusSchema.default('ACTIVE'),
});
export type CreateEmployeeCommand = z.infer<typeof CreateEmployeeCommand>;

/** Bulk creation from a CSV: every row is validated, duplicates are reported, not created. */
export const ImportEmployeesCommand = z.object({
  items: z
    .array(CreateEmployeeCommand.omit({ status: true }))
    .min(1)
    .max(1000),
});
export type ImportEmployeesCommand = z.infer<typeof ImportEmployeesCommand>;

export const ImportEmployeesResult = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.array(
    z.object({
      personnelNumber: z.string(),
      reason: z.enum(['DUPLICATE', 'INVALID']),
    }),
  ),
});
export type ImportEmployeesResult = z.infer<typeof ImportEmployeesResult>;

export const EmployeeView = z.object({
  id: Uuid,
  personnelNumber: PersonnelNumber,
  fullName: z.string(),
  status: EmployeeStatusSchema,
  telegramLinked: z.boolean(),
  /** The personnel assignment in force now; null until HR assigns a position. */
  currentPosition: z
    .object({ positionId: Uuid, orgUnitId: Uuid, teamId: Uuid.nullable() })
    .nullable(),
  createdAt: IsoDateTime,
});
export type EmployeeView = z.infer<typeof EmployeeView>;

/** Код показується один раз у відповіді; у базі лишається лише хеш. */
export const ActivationCodeIssued = z.object({
  employeeId: Uuid,
  code: z.string().length(8),
  deepLink: z.url(),
  expiresAt: IsoDateTime,
});
export type ActivationCodeIssued = z.infer<typeof ActivationCodeIssued>;

/** FR-AUTH-02: перепривʼязка лише HR/адміністратором із причиною. */
export const RelinkTelegramCommand = z.object({
  telegramUserId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export type RelinkTelegramCommand = z.infer<typeof RelinkTelegramCommand>;

export const ChangeEmployeeStatusCommand = z.object({
  status: EmployeeStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
export type ChangeEmployeeStatusCommand = z.infer<typeof ChangeEmployeeStatusCommand>;
