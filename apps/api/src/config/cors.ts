import type { NestFastifyApplication } from '@nestjs/platform-fastify';

type FastifyCorsOptions = NonNullable<Parameters<NestFastifyApplication['enableCors']>[0]>;

/**
 * The panel and the kiosk live on other origins and send the session cookie, so the API
 * needs credentials and the full set of methods: the default list of @fastify/cors lacks
 * PUT/DELETE, which made the preflight of `PUT /admin/schedules/:id/assignments` fail.
 * `x-locale` carries the panel language (reports, incident statistics); a header missing
 * here makes the browser abort the request before it leaves, which the panel shows as
 * "server unavailable".
 */
export function corsOptions(origins: readonly string[]): FastifyCorsOptions {
  return {
    origin: [...origins],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-device-token',
      'idempotency-key',
      'x-locale',
    ],
    maxAge: 600,
  };
}
