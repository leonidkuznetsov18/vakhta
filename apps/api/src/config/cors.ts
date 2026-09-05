import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Панель і кіоск живуть на інших origin і ходять з cookie сесії, тож потрібні
 * credentials і повний набір методів: типовий список @fastify/cors не містить PUT/DELETE,
 * через що preflight на `PUT /admin/schedules/:id/assignments` падав.
 */
export function corsOptions(origins: readonly string[]): CorsOptions {
  return {
    origin: [...origins],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-device-token', 'idempotency-key'],
    maxAge: 600,
  };
}
