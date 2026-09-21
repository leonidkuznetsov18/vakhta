import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { ENV_TENANT_ID, tenantOrigins } from '@vakhta/registry';
import type { RequestWithTenant } from '../infra/tenant-hook.js';

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
      'if-match',
    ],
    maxAge: 600,
  };
}

/**
 * Per-request CORS: the tenant bound by the host hook allows only its own verified panel and
 * kiosk origins (spec AC-010). The env tenant keeps the configured CORS_ORIGINS list.
 */
export function corsDelegate(
  fallbackOrigins: readonly string[],
  scheme: 'https' | 'http',
): FastifyCorsOptions {
  const delegator = async (request: FastifyRequest): Promise<FastifyCorsOptions> => {
    const tenant = (request as RequestWithTenant).tenantRuntime?.tenant;
    const origins =
      tenant && tenant.id !== ENV_TENANT_ID ? tenantOrigins(tenant, scheme) : fallbackOrigins;
    return corsOptions(origins);
  };
  return { delegator };
}
