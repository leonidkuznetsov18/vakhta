import { TenantGateway } from '@vakhta/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { TenantStatus, normalizeHost } from '@vakhta/domain';
import { runWithTenant, type TenantRuntime } from './tenant-context.js';
import { TenantRuntimeRegistry } from './tenant-runtime.js';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { acceptGatewayHost } from './tenant-gateway.js';

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
  gatewayKey?: string,
): void {
  fastify.addHook('onRequest', (request: RequestWithTenant, reply, done) => {
    const hasGatewayHost = request.headers[TenantGateway.HOST_HEADER] !== undefined;
    if (!acceptGatewayHost(request, gatewayKey)) {
      return reject(reply, {
        status: 403,
        code: 'GATEWAY_REJECTED',
        message: 'Invalid gateway credentials',
      });
    }
    if (request.url.split('?')[0] === TenantGateway.ORIGIN_PROBE_PATH) {
      if (!hasGatewayHost)
        return reject(reply, {
          status: 403,
          code: 'GATEWAY_REJECTED',
          message: 'Gateway credentials required',
        });
      void reply
        .header('cache-control', 'no-store')
        .send({ service: TenantGateway.SERVICE, host: request.headers.host });
      return;
    }
    if (isTenantFree(request.url)) return done();
    const host = normalizeHost(request.headers.host ?? '');
    void registry()
      .resolveHost(host)
      .then(async (runtime) => {
        if (!runtime) {
          reject(reply, {
            status: 404,
            code: 'TENANT_NOT_FOUND',
            message: 'No tenant serves this host',
          });
          return;
        }
        if (runtime.tenant.status !== TenantStatus.ACTIVE) {
          reject(reply, {
            status: 403,
            code: 'TENANT_SUSPENDED',
            message: 'This tenant is suspended',
          });
          return;
        }
        request.tenantRuntime = runtime;
        request.log = request.log.child({ tenant: runtime.tenant.slug });
        await registry().prepare(runtime);
        runWithTenant(runtime, done);
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Tenant resolution failed'));
      });
  });
}

/** Adds the tenant hook to a Nest Fastify app before its routes are registered. */
export function bindTenancy(app: NestFastifyApplication): void {
  const key = app.get(ConfigService<Env, true>).get('TENANT_GATEWAY_KEY', { infer: true });
  registerTenantHook(app.getHttpAdapter().getInstance(), () => app.get(TenantRuntimeRegistry), key);
}
