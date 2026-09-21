import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase, databaseErrorCode, readTenantSettingRows } from '@vakhta/db';
import {
  ENV_TENANT_ID,
  primaryHost,
  tenantOrigins,
  type TenantRuntimeConfig,
  type TenantSource,
} from '@vakhta/registry';
import { TenantSurface } from '@vakhta/domain';
import {
  TENANT_SETTING_DEFAULTS,
  resolveTenantSettings,
  type TenantSettings,
} from '@vakhta/contracts';
import type { Redis } from 'ioredis';
import { createAuth, type AuthConfig } from '../auth/auth.config.js';
import type { Env } from '../config/env.js';
import { settingsFromEnv } from '../config/tenant-settings.js';
import { REDIS } from './redis.module.js';
import { PrefixedShortTermStore, RedisShortTermStore } from './short-term-store.js';
import { runWithTenant, type TenantRuntime } from './tenant-context.js';

export const TENANT_SOURCE = Symbol('TENANT_SOURCE');

interface CachedRuntime {
  readonly fingerprint: string;
  readonly runtime: TenantRuntime;
}

/** Fields whose change needs new handles; other fields update in place. Never logged. */
function fingerprintOf(tenant: TenantRuntimeConfig): string {
  return JSON.stringify([
    tenant.databaseUrl,
    tenant.redisPrefix,
    tenant.domains.map((d) => `${d.surface}:${d.host}:${d.isPrimary}:${d.status}`),
  ]);
}

/** In-flight requests keep the old handles; they are closed after this grace period. */
const CLOSE_GRACE_MS = 30_000;

/**
 * Creates and caches one runtime per tenant. A runtime is rebuilt when the source publishes a new
 * version (suspend, secret rotation, removal); the old one is closed after in-flight work.
 */
@Injectable()
export class TenantRuntimeRegistry implements OnApplicationShutdown {
  private readonly cache = new Map<string, CachedRuntime>();
  private readonly closing = new Set<Promise<void>>();
  private readonly loading = new Map<TenantRuntime, Promise<void>>();
  private readonly logger = new Logger(TenantRuntimeRegistry.name);

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
    return this.enter(runtime, fn);
  }

  /** Every entry into a tenant context goes through here so its settings are current. */
  async enter<T>(runtime: TenantRuntime, fn: () => T | Promise<T>): Promise<T> {
    await this.prepare(runtime);
    return runWithTenant(runtime, fn);
  }

  /**
   * Loads the tenant's settings when they are older than one registry refresh. A failed load keeps
   * the previous values (defaults at first) and retries on the next entry; it never blocks work.
   */
  prepare(runtime: TenantRuntime): Promise<void> {
    const maxAgeMs = this.config.get('REGISTRY_REFRESH_SECONDS', { infer: true }) * 1000;
    if (Date.now() - runtime.settingsLoadedAt < maxAgeMs) return Promise.resolve();
    const inFlight = this.loading.get(runtime);
    if (inFlight) return inFlight;
    const load = readTenantSettingRows(runtime.db)
      .then((rows) => {
        const resolved = resolveTenantSettings(this.defaultsFor(runtime.tenant), rows);
        if (resolved.invalid.length > 0) {
          this.logger.warn(
            { tenant: runtime.tenant.slug, invalid: resolved.invalid },
            'Invalid tenant settings ignored',
          );
        }
        runtime.settings = resolved.settings;
        runtime.settingsLoadedAt = Date.now();
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { tenant: runtime.tenant.slug, code: databaseErrorCode(error) },
          'Tenant settings unavailable; previous values kept',
        );
      })
      .finally(() => this.loading.delete(runtime));
    this.loading.set(runtime, load);
    return load;
  }

  private defaultsFor(tenant: TenantRuntimeConfig): TenantSettings {
    if (tenant.id !== ENV_TENANT_ID) return TENANT_SETTING_DEFAULTS;
    return settingsFromEnv({
      PRESENCE_ARRIVE_BEFORE_MINUTES: this.config.get('PRESENCE_ARRIVE_BEFORE_MINUTES', {
        infer: true,
      }),
      PRESENCE_DEPART_AFTER_MINUTES: this.config.get('PRESENCE_DEPART_AFTER_MINUTES', {
        infer: true,
      }),
      EARLY_START_WINDOW_MINUTES: this.config.get('EARLY_START_WINDOW_MINUTES', { infer: true }),
      SHIFT_GRACE_MINUTES: this.config.get('SHIFT_GRACE_MINUTES', { infer: true }),
      OVERTIME_THRESHOLD_MINUTES: this.config.get('OVERTIME_THRESHOLD_MINUTES', { infer: true }),
      AUTO_CLOSE_GRACE_MINUTES: this.config.get('AUTO_CLOSE_GRACE_MINUTES', { infer: true }),
      BREAK_MINUTES: this.config.get('BREAK_MINUTES', { infer: true }),
      MEAL_MINUTES: this.config.get('MEAL_MINUTES', { infer: true }),
      SERVICE_TIME_MINUTES: this.config.get('SERVICE_TIME_MINUTES', { infer: true }),
      DOWNTIME_ESCALATION_MINUTES: this.config.get('DOWNTIME_ESCALATION_MINUTES', { infer: true }),
      INCIDENT_SLA_NORMAL_MINUTES: this.config.get('INCIDENT_SLA_NORMAL_MINUTES', { infer: true }),
      INCIDENT_SLA_CRITICAL_MINUTES: this.config.get('INCIDENT_SLA_CRITICAL_MINUTES', {
        infer: true,
      }),
      INCIDENT_SLA_SAFETY_MINUTES: this.config.get('INCIDENT_SLA_SAFETY_MINUTES', { infer: true }),
      CLEANING_REMINDER_MINUTES: this.config.get('CLEANING_REMINDER_MINUTES', { infer: true }),
      HANDOVER_REVIEW_WINDOW_MINUTES: this.config.get('HANDOVER_REVIEW_WINDOW_MINUTES', {
        infer: true,
      }),
      QR_ROTATION_SECONDS: this.config.get('QR_ROTATION_SECONDS', { infer: true }),
      QR_TTL_SECONDS: this.config.get('QR_TTL_SECONDS', { infer: true }),
      SHIFT_REMINDER_MINUTES: this.config.get('SHIFT_REMINDER_MINUTES', { infer: true }),
      ACK_REMINDER_HOURS: this.config.get('ACK_REMINDER_HOURS', { infer: true }),
      APPEAL_WINDOW_DAYS: this.config.get('APPEAL_WINDOW_DAYS', { infer: true }),
    });
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
        await this.enter(runtime, () => fn(runtime));
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
    const fingerprint = fingerprintOf(tenant);
    if (cached?.fingerprint === fingerprint) {
      // Status, modules, branding or secrets other than the database changed: same handles.
      if (cached.runtime.tenant !== tenant) cached.runtime.tenant = tenant;
      return cached.runtime;
    }
    const runtime = this.create(tenant);
    if (cached) {
      // A new database handle keeps the last known settings until its first successful read.
      runtime.settings = cached.runtime.settings;
      this.retire(cached.runtime);
    }
    this.cache.set(tenant.id, { fingerprint, runtime });
    return runtime;
  }

  private retire(runtime: TenantRuntime): void {
    const timer = setTimeout(() => {
      const closed = runtime.close().catch(() => undefined);
      this.closing.add(closed);
      void closed.finally(() => this.closing.delete(closed));
    }, CLOSE_GRACE_MS);
    timer.unref();
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
      settings: this.defaultsFor(tenant),
      settingsLoadedAt: 0,
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
