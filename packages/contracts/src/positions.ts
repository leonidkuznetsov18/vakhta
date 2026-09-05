import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

/** Кадрове призначення: перевід створює нову версію, стара закривається (ТЗ 2.2). */
export const AssignPositionCommand = z.object({
  orgUnitId: Uuid,
  positionId: Uuid,
  teamId: Uuid.optional(),
  managerEmployeeId: Uuid.optional(),
  /** За замовчуванням зараз. */
  validFrom: IsoDateTime.optional(),
});
export type AssignPositionCommand = z.infer<typeof AssignPositionCommand>;

export const EmployeePositionView = z.object({
  id: Uuid,
  employeeId: Uuid,
  orgUnitId: Uuid,
  positionId: Uuid,
  teamId: Uuid.nullable(),
  managerEmployeeId: Uuid.nullable(),
  validFrom: IsoDateTime,
  validTo: IsoDateTime.nullable(),
});
export type EmployeePositionView = z.infer<typeof EmployeePositionView>;
