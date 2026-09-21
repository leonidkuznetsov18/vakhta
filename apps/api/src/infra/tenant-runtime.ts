import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from '@vakhta/db';
import {
  ENV_TENANT_ID,
  primaryHost,
  tenantOrigins,
  type TenantRuntimeConfig,
  type TenantSource,
} from '@vakhta/registry';
import { TenantSurface } from '@vakhta/domain';
import type { Redis } from 'ioredis';
import { createAuth, type AuthConfig } from '../auth/auth.config.js';
import type { Env } from '../config/env.js';
import { REDIS } from './redis.module.js';
import { PrefixedShortTermStore, RedisShortTermStore } from './short-term-store.js';
import { runWithTenant, type TenantRuntime } from './tenant-context.js';

export const TENANT_SOURCE = Symbol('TENANT_SOURCE');

interface CachedRuntime {
  readonly version: number;
  readonly runtime: TenantRuntime;
}

/**
 * Creates and caches one runtime per tenant. A runtime is rebuilt when the source publishes a new
 * version (suspend, secret rotation, removal); the old one is closed after in-flight work.
 */
@Injectable()
export class TenantRuntimeRegistry implements OnApplicationShutdown {
  private readonly cache = new Map<string, CachedRuntime>();
  private readonly closing: Promise<void>[] = [];

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(TENANT_SOURCE) readonly source: TenantSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  byHost(host: string): TenantRuntime | null {
    const tenant = this.source.byHost(host);
    return tenant ? this.runtimeFor(tenant) : null;
  }

  byId(tenantId: string): TenantRuntime | null {
    const tenant = this.source.byId(tenantId);
    return tenant ? this.runtimeFor(tenant) : null;
  }

  bySlug(slug: string): TenantRuntime | null {
    const tenant = this.source.bySlug(slug);
    return tenant ? this.runtimeFor(tenant) : null;
  }

  /** Runs `fn` inside the tenant's context; null when the tenant is unknown. */
  run<T>(tenantId: string, fn: () => Promise<T>): Promise<T | null> {
    const runtime = this.byId(tenantId);
    if (!runtime) return Promise.resolve(null);
    return runWithTenant(runtime, fn);
  }

  /**
   * Runs `fn` once per serving tenant, each in its own context. One tenant's failure is reported
   * and never stops the others (spec AC-014).
   */
  async forEachActive(
    fn: (runtime: TenantRuntime) => Promise<void>,
    onError: (error: unknown, tenant: TenantRuntimeConfig) => void,
  ): Promise<void> {
    const runOne = async (tenant: TenantRuntimeConfig): Promise<void> => {
      const runtime = this.runtimeFor(tenant);
      try {
        await runWithTenant(runtime, () => fn(runtime));
      } catch (error) {
        onError(error, tenant);
      }
    };
    // Sequential on purpose: one process should not open every tenant's pool at once.
    await this.source
      .active()
      .reduce((chain, tenant) => chain.then(() => runOne(tenant)), Promise.resolve());
  }

  runtimeFor(tenant: TenantRuntimeConfig): TenantRuntime {
    const cached = this.cache.get(tenant.id);
    if (cached?.version === this.source.version) return cached.runtime;
    if (cached) this.closing.push(cached.runtime.close());
    const runtime = this.create(tenant);
    this.cache.set(tenant.id, { version: this.source.version, runtime });
    return runtime;
  }

  private create(tenant: TenantRuntimeConfig): TenantRuntime {
    const { db, client } = createDatabase(tenant.databaseUrl, {
      max: this.config.get('TENANT_POOL_MAX', { infer: true }),
    });
    const authConfig = this.authConfigFor(tenant, db);
    const base = new RedisShortTermStore(this.redis);
    return {
      tenant,
      db,
      auth: createAuth(authConfig),
      authConfig,
      store: tenant.redisPrefix ? new PrefixedShortTermStore(base, tenant.redisPrefix) : base,
      close: () => client.end({ timeout: 5 }),
    };
  }

  /** The env tenant keeps the historical URL and origins; registry tenants derive them from hosts. */
  private authConfigFor(tenant: TenantRuntimeConfig, db: TenantRuntime['db']): AuthConfig {
    const publicBaseUrl = this.config.get('PUBLIC_BASE_URL', { infer: true });
    const shared = {
      db,
      secret: this.config.get('AUTH_SECRET', { infer: true }),
      cookieSameSite: this.config.get('AUTH_COOKIE_SAME_SITE', { infer: true }),
    };
    if (tenant.id === ENV_TENANT_ID) {
      return {
        ...shared,
        baseURL: publicBaseUrl,
        trustedOrigins: this.config.get('CORS_ORIGINS', { infer: true }),
      };
    }
    const scheme = publicBaseUrl.startsWith('https://') ? 'https' : 'http';
    const apiHost = primaryHost(tenant, TenantSurface.API);
    return {
      ...shared,
      baseURL: apiHost ? `${scheme}://${apiHost}` : publicBaseUrl,
      trustedOrigins: tenantOrigins(tenant, scheme),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    const open = [...this.cache.values()].map((entry) => entry.runtime.close());
    this.cache.clear();
    await Promise.all([...open, ...this.closing]);
  }
}
