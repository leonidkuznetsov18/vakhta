import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { employees } from './identity.js';
import { sites } from './org.js';
import { shiftAssignments } from './scheduling.js';

export const checkpointType = pgEnum('checkpoint_type', ['ENTRY', 'EXIT', 'BOTH']);
export const terminalStatus = pgEnum('terminal_status', ['ACTIVE', 'DISABLED']);
export const checkAction = pgEnum('check_action', ['ARRIVE', 'DEPART']);
export const presenceMethod = pgEnum('presence_method', ['QR', 'TERMINAL', 'MASTER', 'WEB']);
export const presenceStatus = pgEnum('presence_status', ['OPEN', 'CLOSED', 'NEEDS_CLARIFICATION']);

/** Екран або кіоск на контрольній точці, зареєстрований за майданчиком (FR-QR-01). */
export const qrTerminals = pgTable(
  'qr_terminals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    name: text('name').notNull(),
    checkpoint: checkpointType('checkpoint').notNull().default('BOTH'),
    /** SHA-256 device token; сам токен показується один раз при реєстрації. */
    deviceTokenHash: text('device_token_hash').notNull().unique(),
    status: terminalStatus('status').notNull().default('ACTIVE'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('qr_terminals_site_idx').on(t.siteId)],
);

/** Короткоживучий challenge (ADR-4): лише хеш токена, термінал, строк дії. */
export const qrChallenges = pgTable(
  'qr_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    terminalId: uuid('terminal_id')
      .notNull()
      .references(() => qrTerminals.id),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('qr_challenges_terminal_issued_idx').on(t.terminalId, t.issuedAt),
    index('qr_challenges_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Використання challenge (FR-QR-03): один QR обслуговує багатьох, але пара
 * працівник + зміна застосовується для дії один раз; повтор повертає перший результат.
 */
export const qrChallengeUses = pgTable(
  'qr_challenge_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => qrChallenges.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    assignmentId: uuid('assignment_id').references(() => shiftAssignments.id),
    action: checkAction('action').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('qr_challenge_uses_once_uq')
      .on(t.employeeId, t.assignmentId, t.action)
      .where(sql`${t.assignmentId} IS NOT NULL`),
    index('qr_challenge_uses_challenge_idx').on(t.challengeId),
  ],
);

/**
 * Присутність (ТЗ 4.1, FR-TIME-01/05): від «Я на роботі» до «Я пішов». Може бути довшою
 * за робочу зміну і не є робочим часом. У працівника не більше однієї відкритої (ТЗ 4.5).
 */
export const presenceSessions = pgTable(
  'presence_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    assignmentId: uuid('assignment_id').references(() => shiftAssignments.id),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
    departedAt: timestamp('departed_at', { withTimezone: true }),
    arrivalMethod: presenceMethod('arrival_method').notNull(),
    departureMethod: presenceMethod('departure_method'),
    arrivalTerminalId: uuid('arrival_terminal_id').references(() => qrTerminals.id),
    departureTerminalId: uuid('departure_terminal_id').references(() => qrTerminals.id),
    /** Хто підтвердив резервну відмітку (FR-QR-06). */
    confirmedBy: uuid('confirmed_by'),
    reasonCode: text('reason_code'),
    status: presenceStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('presence_sessions_open_uq')
      .on(t.employeeId)
      .where(sql`${t.status} = 'OPEN'`),
    index('presence_sessions_employee_arrived_idx').on(t.employeeId, t.arrivedAt),
    index('presence_sessions_assignment_idx').on(t.assignmentId),
  ],
);
