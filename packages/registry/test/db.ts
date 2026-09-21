import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createRegistry, type RegistryDatabase } from '../src/client.js';
import { migrateRegistry } from '../src/migrations.js';

export interface TestRegistry {
  readonly db: RegistryDatabase;
  readonly url: string;
  stop(): Promise<void>;
}

/** Copy of apps/api/test/docker.ts: the Docker socket from the active docker context. */
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
    // docker CLI missing: testcontainers reports the missing runtime itself.
  }
}

export async function startTestRegistry(): Promise<TestRegistry> {
  ensureDockerHost();
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vakhta_control_test')
    .start();
  const url = container.getConnectionUri();
  const { db, client } = createRegistry(url, { max: 2 });
  await migrateRegistry(db);
  return {
    db,
    url,
    async stop() {
      await client.end({ timeout: 5 });
      await container.stop();
    },
  };
}
