import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { TenantStatus, normalizeHost } from '@vakhta/domain';
import { runWithTenant, type TenantRuntime } from './tenant-context.js';
import { TenantRuntimeRegistry } from './tenant-runtime.js';

/** Routes that answer without a tenant: liveness and scraping. */
const TENANT_FREE_PREFIXES = ['/health', '/metrics'];

export type RequestWithTenant = FastifyRequest & { tenantRuntime?: TenantRuntime };

function isTenantFree(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return TENANT_FREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

interface Rejection {
  readonly status: 404 | 403;
  readonly code: string;
  readonly message: string;
}

function reject(reply: FastifyReply, rejection: Rejection): void {
  void reply
    .status(rejection.status)
    .send({ statusCode: rejection.status, code: rejection.code, message: rejection.message });
}

/**
 * Binds every request to exactly one tenant by its host before any route, guard or auth handler
 * runs (spec AC-005). Registered on the root Fastify instance before routes are declared.
 */
export function registerTenantHook(
  fastify: FastifyInstance,
  registry: () => TenantRuntimeRegistry,
): void {
  fastify.addHook('onRequest', (request: RequestWithTenant, reply, done) => {
    if (isTenantFree(request.url)) return done();
    const host = normalizeHost(request.headers.host ?? '');
    const runtime = registry().byHost(host);
    if (!runtime) {
      return reject(reply, {
        status: 404,
        code: 'TENANT_NOT_FOUND',
        message: `No tenant serves host "${host}"`,
      });
    }
    if (runtime.tenant.status !== TenantStatus.ACTIVE) {
      return reject(reply, {
        status: 403,
        code: 'TENANT_SUSPENDED',
        message: 'This tenant is suspended',
      });
    }
    request.tenantRuntime = runtime;
    request.log = request.log.child({ tenant: runtime.tenant.slug });
    // prepare() never rejects: a settings read failure keeps the previous values.
    void registry()
      .prepare(runtime)
      .then(() => runWithTenant(runtime, done));
  });
}

/** Adds the tenant hook to a Nest Fastify app before its routes are registered. */
export function bindTenancy(app: NestFastifyApplication): void {
  registerTenantHook(app.getHttpAdapter().getInstance(), () => app.get(TenantRuntimeRegistry));
}
