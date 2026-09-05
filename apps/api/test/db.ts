import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabase, migrate, type Database } from '@vakhta/db';
import { ensureDockerHost } from './docker.js';

export interface TestDatabase {
  readonly db: Database;
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Реальний PostgreSQL у контейнері з застосованими міграціями з packages/db/drizzle.
 * Один контейнер на файл тестів; таблиці чистяться самими тестами.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  ensureDockerHost();
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vakhta_test')
    .start();
  const url = container.getConnectionUri();
  const { db, client } = createDatabase(url, { max: 4 });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/drizzle/', import.meta.url)),
  });
  return {
    db,
    url,
    async stop() {
      await client.end({ timeout: 5 });
      await container.stop();
    },
  };
}
