import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

export const EmployeeStatusSchema = z.enum(['ACTIVE', 'BLOCKED', 'TERMINATED']);

/** Табельний номер: як у кадровій системі, без пробілів по краях. */
export const PersonnelNumber = z.string().trim().min(1).max(32);

/** Empty strings from forms count as "not given". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/**
 * Phone in E.164 after normalization: separators are dropped, a Ukrainian local number
 * (0XXXXXXXXX) gets +38, "00" becomes "+".
 */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/[\s().-]/g, '');
  if (/^00\d+$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^0\d{9}$/.test(compact)) return `+38${compact}`;
  if (/^380\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}
export const EmployeeEmail = z.string().trim().toLowerCase().email().max(200);
export const EmployeePhone = z.preprocess(
  (v) => (typeof v === 'string' ? normalizePhone(v) : v),
  z.string().regex(/^\+[1-9]\d{9,14}$/),
);
/** Telegram username: 5–32 letters, digits and underscores, stored without the "@". */
export const TelegramUsername = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .trim()
          .replace(/^@/, '')
          .replace(/^https?:\/\/t\.me\//i, '')
      : v,
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/),
);
export const EmployeeContacts = z.object({
  email: z.preprocess(blankToUndefined, EmployeeEmail.optional()),
  phone: z.preprocess(blankToUndefined, EmployeePhone.optional()),
  telegramUsername: z.preprocess(blankToUndefined, TelegramUsername.optional()),
});

/** HR або адміністратор створює картку до активації (ТЗ 2.2). */
export const CreateEmployeeCommand = EmployeeContacts.extend({
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
  email: z.string().nullable(),
  phone: z.string().nullable(),
  telegramUsername: z.string().nullable(),
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

/** Codes for several employees at once (a team on a printed sheet); inactive ones are skipped. */
export const IssueActivationCodesCommand = z.object({ employeeIds: z.array(Uuid).min(1).max(500) });
export type IssueActivationCodesCommand = z.infer<typeof IssueActivationCodesCommand>;

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
