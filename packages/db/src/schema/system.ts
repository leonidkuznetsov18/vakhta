import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Налаштування майданчика або глобальні: scope = 'global' або uuid майданчика (ТЗ 18). */
export const settings = pgTable(
  'settings',
  {
    scope: text('scope').notNull().default('global'),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

/** Дедуплікація вхідних оновлень Telegram (ТЗ 12.2, ADR-3). */
export const processedTelegramUpdates = pgTable('processed_telegram_updates', {
  updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  result: jsonb('result').$type<Record<string, unknown>>(),
});

/** Збережена відповідь на команду за ключем ідемпотентності (FR-UI-02, NFR-04). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);
