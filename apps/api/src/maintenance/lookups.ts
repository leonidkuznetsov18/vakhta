import {
  and,
  employeePositions,
  employees,
  eq,
  inArray,
  isNull,
  positions,
  telegramAccounts,
  type DbOrTx,
} from '@vakhta/db';
import type { PersonRef } from '@vakhta/contracts';
import { DomainError } from '../common/domain-error.js';

/** Active employees whose current position maintains equipment (spec A-1). */
export async function maintenanceStaff(db: DbOrTx, ids?: readonly string[]) {
  const conditions = [
    eq(employees.status, 'ACTIVE' as const),
    isNull(employeePositions.validTo),
    eq(positions.performsMaintenance, true),
  ];
  if (ids) conditions.push(inArray(employees.id, [...ids]));
  return db
    .selectDistinctOn([employees.id], {
      id: employees.id,
      fullName: employees.fullName,
      positionName: positions.name,
      orgUnitId: employeePositions.orgUnitId,
    })
    .from(employees)
    .innerJoin(employeePositions, eq(employeePositions.employeeId, employees.id))
    .innerJoin(positions, eq(positions.id, employeePositions.positionId))
    .where(and(...conditions));
}

/** Refuses anyone who is not an active maintenance employee (FR-004, AC-003). */
export async function assertMechanics(db: DbOrTx, ids: readonly (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return;
  const found = new Set((await maintenanceStaff(db, wanted)).map((row) => row.id));
  if (wanted.some((id) => !found.has(id)))
    throw new DomainError('MECHANIC_NOT_ELIGIBLE', 422, 'Employee does not maintain equipment');
}

/** The responsible and the backup mechanic of a machine: two different mechanics (FR-004). */
export async function assertMechanicPair(
  db: DbOrTx,
  pair: { readonly responsible: string; readonly backup: string | null | undefined },
) {
  if (pair.backup && pair.backup === pair.responsible)
    throw new DomainError('BACKUP_IS_RESPONSIBLE', 422, 'The backup must be another mechanic');
  await assertMechanics(db, [pair.responsible, pair.backup]);
}

/** Employees with an active Telegram link among the given ones. */
export async function linkedEmployees(db: DbOrTx, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: telegramAccounts.employeeId })
    .from(telegramAccounts)
    .where(
      and(inArray(telegramAccounts.employeeId, [...ids]), eq(telegramAccounts.status, 'ACTIVE')),
    );
  return new Set(rows.map((row) => row.id));
}

/** Names of employees by id, one query for a whole list. */
export async function peopleById(
  db: DbOrTx,
  ids: readonly (string | null)[],
): Promise<Map<string, PersonRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(inArray(employees.id, wanted));
  return new Map(rows.map((row) => [row.id, row]));
}

export function person(people: Map<string, PersonRef>, id: string): PersonRef {
  return people.get(id) ?? { id, fullName: '—' };
}
