import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Testcontainers шукає DOCKER_HOST або /var/run/docker.sock. На macOS із Colima,
 * OrbStack чи Docker Desktop сокет лежить у домашній теці, тому беремо endpoint
 * з активного docker context, як це робить сам docker CLI.
 */
export function ensureDockerHost(): void {
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
