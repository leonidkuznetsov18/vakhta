import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from '@vakhta/db';
import { createDatabase, type Database } from '@vakhta/db';

export interface TestDatabase {
  readonly db: Database;
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Testcontainers шукає DOCKER_HOST або /var/run/docker.sock. На macOS із Colima,
 * OrbStack чи Docker Desktop сокет лежить у домашній теці, тому беремо endpoint
 * з активного docker context, як це робить сам docker CLI.
 */
function ensureDockerHost(): void {
  if (process.env['DOCKER_HOST'] || existsSync('/var/run/docker.sock')) return;
  try {
    const host = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (!host) return;
    process.env['DOCKER_HOST'] = host;
    // Усередині VM сокет завжди /var/run/docker.sock; потрібно для контейнера-ріпера.
    process.env['TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE'] ??= '/var/run/docker.sock';
  } catch {
    // docker CLI відсутній: testcontainers сам повідомить, що рантайму немає.
  }
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
