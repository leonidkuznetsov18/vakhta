import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgUnits, positions, teams } from './org.js';

export const employeeStatus = pgEnum('employee_status', ['ACTIVE', 'BLOCKED', 'TERMINATED']);
/** Interface languages; mirrors LOCALES in @vakhta/domain. */
export const localeEnum = pgEnum('locale', ['uk', 'en', 'ru']);

/** Кадрова картка (ТЗ 2.2). Створюється HR або адміністратором до активації бота. */
export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  personnelNumber: text('personnel_number').notNull().unique(),
  fullName: text('full_name').notNull(),
  status: employeeStatus('status').notNull().default('ACTIVE'),
  /** Bot and notification language; null until the employee links Telegram or picks one. */
  locale: localeEnum('locale'),
  /** Optional contacts kept for HR: normalized e-mail, E.164 phone, Telegram username without "@". */
  email: text('email'),
  phone: text('phone'),
  telegramUsername: text('telegram_username'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Версія кадрового призначення: перевід створює новий рядок, а не редагує старий (ТЗ 2.2). */
export const employeePositions = pgTable(
  'employee_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    teamId: uuid('team_id').references(() => teams.id),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id),
    managerEmployeeId: uuid('manager_employee_id').references(() => employees.id),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
  },
  (t) => [index('employee_positions_employee_idx').on(t.employeeId, t.validFrom)],
);

export const telegramAccountStatus = pgEnum('telegram_account_status', ['ACTIVE', 'REVOKED']);

/**
 * Прив'язка Telegram (FR-AUTH-02). Один активний user_id на працівника і один працівник
 * на user_id: часткові унікальні індекси тримають це на рівні бази.
 */
export const telegramAccounts = pgTable(
  'telegram_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }).notNull(),
    status: telegramAccountStatus('status').notNull().default('ACTIVE'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: text('revoke_reason'),
  },
  (t) => [
    uniqueIndex('telegram_accounts_active_user_uq')
      .on(t.telegramUserId)
      .where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex('telegram_accounts_active_employee_uq')
      .on(t.employeeId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

/** Одноразовий код активації: лише хеш, строк дії, ліміт спроб (ТЗ 2.2). */
export const activationCodes = pgTable(
  'activation_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activation_codes_employee_idx').on(t.employeeId)],
);
