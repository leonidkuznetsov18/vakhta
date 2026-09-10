import { employees, eq, type DbOrTx } from '@vakhta/db';

/**
 * Serialize presence changes and shift creation. NO KEY UPDATE remains compatible with FK checks
 * while a concurrent master/system close holds the shift row and inserts its employee summary.
 */
export async function lockEmployee(tx: DbOrTx, employeeId: string): Promise<void> {
  await tx
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .for('no key update');
}
