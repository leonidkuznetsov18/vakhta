/**
 * Міграції без drizzle-kit: для контейнерів продакшену, де є лише runtime-залежності.
 * Використовує той самий журнал `drizzle/meta/_journal.json` і таблицю `__drizzle_migrations`,
 * що й `drizzle-kit migrate`, тож dev і prod взаємозамінні. Запуск: node dist/migrate.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL не задано');

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
const { db, client } = createDatabase(DATABASE_URL, { max: 1 });

try {
  const startedAt = Date.now();
  await migrate(db, { migrationsFolder });
  console.log(JSON.stringify({ ok: true, migrationsFolder, ms: Date.now() - startedAt }));
} finally {
  await client.end({ timeout: 5 });
}
