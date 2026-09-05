import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sites } from './org.js';

export const checkpointType = pgEnum('checkpoint_type', ['ENTRY', 'EXIT', 'BOTH']);
export const terminalStatus = pgEnum('terminal_status', ['ACTIVE', 'DISABLED']);

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
