import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';
import { EmployeeView, UpdateEmployeeCommand } from './identity.js';

export const MaritalStatus = z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']);
export const ProfileAccess = z.object({
  personalEdit: z.boolean(),
  statusEdit: z.boolean().default(false),
  maritalStatus: z.boolean(),
  birthDate: z.enum(['FULL', 'DAY_MONTH']),
  compensation: z.enum(['NONE', 'READ', 'WRITE']),
});
export const EmployeeBirthDate = BusinessDate.refine(
  (date) => {
    const today = new Date();
    const latest = `${today.getUTCFullYear() - 14}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    return date <= latest;
  },
  { message: 'Employee must be at least 14 years old' },
);
export const UpdateEmployeeProfileCommand = UpdateEmployeeCommand.extend({
  birthDate: EmployeeBirthDate.nullable().optional(),
  maritalStatus: MaritalStatus.nullable().optional(),
  expectedVersion: IsoDateTime,
}).strict();
export type UpdateEmployeeProfileCommand = z.infer<typeof UpdateEmployeeProfileCommand>;
const Amount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
export const AddCompensationEntryCommand = z
  .object({
    effectiveFrom: BusinessDate,
    employmentRate: z
      .string()
      .regex(/^(0\.\d{1,2}|1(\.0{1,2})?)$/)
      .refine((value) => Number(value) >= 0.01),
    hourlyRate: Amount.nullable(),
    monthlySalary: Amount.nullable(),
    correctsEntryId: Uuid.nullable().default(null),
    reason: z.string().trim().min(3).max(1000).nullable().default(null),
  })
  .strict()
  .refine((entry) => entry.hourlyRate !== null || entry.monthlySalary !== null, {
    path: ['hourlyRate'],
    message: 'Tariff or salary is required',
  })
  .refine((entry) => !entry.correctsEntryId || !!entry.reason, {
    path: ['reason'],
    message: 'A correction requires a reason',
  });
export type AddCompensationEntryCommand = z.infer<typeof AddCompensationEntryCommand>;
export const CompensationEntry = z.object({
  id: Uuid,
  effectiveFrom: BusinessDate,
  employmentRate: z.string(),
  hourlyRate: z.string().nullable(),
  monthlySalary: z.string().nullable(),
  currency: z.literal('UAH'),
  correctsEntryId: Uuid.nullable(),
  reason: z.string().nullable(),
  createdAt: IsoDateTime,
  state: z.enum(['CORRECTED', 'SCHEDULED', 'EFFECTIVE']),
});
export type CompensationEntry = z.infer<typeof CompensationEntry>;
export const CompensationView = z.object({
  asOf: BusinessDate,
  current: CompensationEntry.nullable(),
  history: z.array(CompensationEntry),
});
export type CompensationView = z.infer<typeof CompensationView>;
export const CompensationQuery = z.object({ asOf: BusinessDate.optional() });
export const SetUnitMasterCommand = z.object({ employeeId: Uuid }).strict();
export type SetUnitMasterCommand = z.infer<typeof SetUnitMasterCommand>;
const NamedRecord = z.object({ id: Uuid, name: z.string() });
const Zone = NamedRecord.extend({ available: z.boolean() });
export const ProfileScheduleShift = z.object({
  id: Uuid,
  date: BusinessDate,
  startAt: IsoDateTime,
  endAt: IsoDateTime,
  template: z.string(),
  timezone: z.string(),
  zone: Zone.nullable(),
});
export const EmployeeProfileView = z.object({
  employee: EmployeeView.omit({ birthDate: true }),
  version: IsoDateTime,
  access: ProfileAccess,
  birthDate: z
    .union([BusinessDate, z.object({ day: z.number().int(), month: z.number().int() })])
    .nullable(),
  maritalStatus: MaritalStatus.nullable().optional(),
  avatarVersion: Uuid.nullable(),
  work: z.object({
    position: NamedRecord.nullable(),
    unit: NamedRecord.nullable(),
    team: NamedRecord.nullable(),
    master: z.object({
      employee: NamedRecord.nullable(),
      state: z.enum(['ASSIGNED', 'MISSING', 'INACTIVE', 'NO_PANEL_ACCESS']),
      isSelf: z.boolean(),
      canOpen: z.boolean(),
    }),
    masterOf: z.array(NamedRecord),
    zone: z.object({
      current: Zone.nullable(),
      source: z.enum(['CURRENT_SHIFT', 'NEXT_SHIFT', 'NOT_SCHEDULED']),
      monthZones: z.array(Zone),
    }),
    history: z.array(
      z.object({
        id: Uuid,
        position: z.string(),
        unit: z.string(),
        master: z.string().nullable().default(null),
        validFrom: IsoDateTime,
        validTo: IsoDateTime.nullable(),
      }),
    ),
  }),
  schedule: z.object({
    month: z.string(),
    timezone: z.string(),
    published: z.boolean(),
    shiftCount: z.number().int(),
    plannedMinutes: z.number(),
    nextShifts: z.array(ProfileScheduleShift),
  }),
  compensation: CompensationView.optional(),
});
export type EmployeeProfileView = z.infer<typeof EmployeeProfileView>;
