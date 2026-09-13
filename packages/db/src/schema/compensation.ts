import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees } from './identity.js';

/** Reference compensation only. Corrections append a new row; SQL triggers preserve history. */
export const employeeCompensationEntries = pgTable(
  'employee_compensation_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    effectiveFrom: date('effective_from').notNull(),
    employmentRate: numeric('employment_rate').notNull(),
    hourlyRate: numeric('hourly_rate'),
    monthlySalary: numeric('monthly_salary'),
    currency: text('currency').notNull().default('UAH'),
    correctsEntryId: uuid('corrects_entry_id').references(
      (): AnyPgColumn => employeeCompensationEntries.id,
    ),
    reason: text('reason'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('compensation_rate_range', sql`${t.employmentRate} > 0 AND ${t.employmentRate} <= 1`),
    check(
      'compensation_amounts',
      sql`(${t.hourlyRate} IS NULL OR ${t.hourlyRate} >= 0) AND (${t.monthlySalary} IS NULL OR ${t.monthlySalary} >= 0)`,
    ),
    check(
      'compensation_precision',
      sql`scale(${t.employmentRate}) <= 2 AND (${t.hourlyRate} IS NULL OR scale(${t.hourlyRate}) <= 2 AND ${t.hourlyRate} < 10000000000) AND (${t.monthlySalary} IS NULL OR scale(${t.monthlySalary}) <= 2 AND ${t.monthlySalary} < 10000000000)`,
    ),
    check(
      'compensation_amount_required',
      sql`${t.hourlyRate} IS NOT NULL OR ${t.monthlySalary} IS NOT NULL`,
    ),
    check('compensation_currency', sql`${t.currency} = 'UAH'`),
    check(
      'compensation_correction_reason',
      sql`${t.correctsEntryId} IS NULL OR length(trim(${t.reason})) >= 3 AND ${t.reason} IS NOT NULL`,
    ),
    uniqueIndex('compensation_original_date_uq')
      .on(t.employeeId, t.effectiveFrom)
      .where(sql`${t.correctsEntryId} IS NULL`),
    uniqueIndex('compensation_correction_target_uq')
      .on(t.correctsEntryId)
      .where(sql`${t.correctsEntryId} IS NOT NULL`),
    index('compensation_employee_date_idx').on(t.employeeId, t.effectiveFrom, t.createdAt),
  ],
);
