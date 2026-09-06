import { eq } from 'drizzle-orm';
import { DEFAULT_LOCALE, type Locale } from '@vakhta/domain';
import type { DbOrTx } from './client.js';
import { employees } from './schema/identity.js';

/** Language for texts addressed to an employee: their choice, otherwise the default. */
export async function employeeLocale(db: DbOrTx, employeeId: string): Promise<Locale> {
  const [row] = await db
    .select({ locale: employees.locale })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row?.locale ?? DEFAULT_LOCALE;
}
