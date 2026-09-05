import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabase, migrate, type Database } from '@vakhta/db';

export interface TestDatabase {
  readonly db: Database;
  stop(): Promise<void>;
}

/** Копія helper-а з apps/api/test/db.ts: Docker-сокет з активного docker context. */
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
    process.env['TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE'] ??= '/var/run/docker.sock';
  } catch {
    // docker CLI відсутній: testcontainers сам повідомить, що рантайму немає.
  }
}

export async function startTestDatabase(): Promise<TestDatabase> {
  ensureDockerHost();
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vakhta_test')
    .start();
  const { db, client } = createDatabase(container.getConnectionUri(), { max: 4 });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/drizzle/', import.meta.url)),
  });
  return {
    db,
    async stop() {
      await client.end({ timeout: 5 });
      await container.stop();
    },
  };
}
