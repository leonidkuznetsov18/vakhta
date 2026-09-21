import { ConfigService } from '@nestjs/config';
import { EnvTenantSource, ENV_TENANT_ID, tenantFromEnv } from '@vakhta/registry';
import { TenantRuntimeRegistry } from './tenant-runtime.js';
import { REDIS } from './redis.module.js';
import { runWithTenant, currentStoragePrefix } from './tenant-context.js';
import { KioskService } from '../kiosk/kiosk.service.js';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  and,
  createDatabase,
  eq,
  inArray,
  migrateTenantDatabase,
  qrTerminals,
  seedTenantDefaults,
  settings,
  sql,
} from '@vakhta/db';
import { TENANT_SETTING_DEFAULTS, TenantErrorCode } from '@vakhta/contracts';
import { ModuleStatus, TenantModule } from '@vakhta/domain';
import { hashDeviceToken } from '@vakhta/domain/node';
import {
  SecretCipher,
  createRegistry,
  generateSecretKeyHex,
  migrateRegistry,
  registerExistingTenant,
  tenantModules,
  tenants,
  type RegistryDatabase,
} from '@vakhta/registry';
import { DomainErrorFilter } from '../common/domain-error.js';
import { corsDelegate } from '../config/cors.js';
import { ensureDockerHost } from '../../test/docker.js';

const SYSTEM = { type: 'SYSTEM', id: null, role: 'SYSTEM' } as const;
const PASSWORD = 'isolation-password-123456';
const DEVICE_TOKEN = 'device-token-of-tenant-a-0001';

interface TenantFixture {
  readonly slug: string;
  readonly apiHost: string;
  readonly panelHost: string;
  url: string;
  id: string;
}

function withDatabase(uri: string, database: string): string {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Isolation invariants of the tenant context (spec AC-005…AC-010, SC-003): two real tenant
 * databases behind one API process in registry mode. Every check crosses a boundary on purpose.
 */
describe('tenancy: every request is bound to exactly one tenant', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: NestFastifyApplication;
  let registry: RegistryDatabase;
  let closeRegistry: () => Promise<void>;
  const key = generateSecretKeyHex();
  const a: TenantFixture = {
    slug: 'alpha',
    apiHost: 'api.alpha.test',
    panelHost: 'alpha.test',
    url: '',
    id: '',
  };
  const b: TenantFixture = {
    slug: 'bravo',
    apiHost: 'api.bravo.test',
    panelHost: 'bravo.test',
    url: '',
    id: '',
  };

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const adminUrl = postgres.getConnectionUri();
    const admin = createDatabase(adminUrl, { max: 1 });
    await admin.db.execute(sql`CREATE DATABASE tenant_alpha`);
    await admin.db.execute(sql`CREATE DATABASE tenant_bravo`);
    await admin.client.end({ timeout: 5 });
    a.url = withDatabase(adminUrl, 'tenant_alpha');
    b.url = withDatabase(adminUrl, 'tenant_bravo');
    await migrateTenantDatabase(a.url);
    await migrateTenantDatabase(b.url);

    const control = createRegistry(adminUrl, { max: 2 });
    registry = control.db;
    closeRegistry = () => control.client.end({ timeout: 5 });
    await migrateRegistry(registry);
    const cipher = new SecretCipher(key);
    await Promise.all(
      [a, b].map(async (tenant) => {
        const registered = await registerExistingTenant(registry, cipher, {
          slug: tenant.slug,
          legacyEnv: tenant === a,
          name: tenant.slug,
          timezone: 'Europe/Kyiv',
          defaultLocale: 'uk',
          databaseUrl: tenant.url,
          apiHost: tenant.apiHost,
          panelHost: tenant.panelHost,
          webhookSecret: `webhook-secret-${tenant.slug}-0000`,
        });
        tenant.id = registered.id;
      }),
    );

    Object.assign(process.env, {
      NODE_ENV: 'test',
      TENANCY_MODE: 'registry',
      CONTROL_DATABASE_URL: adminUrl,
      CONTROL_ENCRYPTION_KEY: key,
      DATABASE_URL: adminUrl,
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      AUTH_SECRET: 'isolation-auth-secret-at-least-32-characters',
      ACTIVATION_PEPPER: 'isolation-activation-pepper',
      PUBLIC_BASE_URL: 'http://api.alpha.test',
      CORS_ORIGINS: 'http://alpha.test',
      TELEGRAM_BOT_TOKEN: '',
    });
    const { AppModule } = await import('../app.module.js');
    const { bindTenancy } = await import('./tenant-hook.js');
    const { registerAuthRoutes } = await import('../auth/auth.routes.js');
    const { AUTH } = await import('../auth/auth.service.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
      abortOnError: false,
    });
    bindTenancy(app);
    app.useGlobalFilters(new DomainErrorFilter());
    app.enableCors(corsDelegate(['http://alpha.test'], 'http'));
    registerAuthRoutes(app.getHttpAdapter().getInstance(), app.get(AUTH));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await closeRegistry();
    await redis.stop();
    await postgres.stop();
  });

  async function inTenant<T>(tenant: TenantFixture, fn: () => Promise<T>): Promise<T> {
    const { TenantRuntimeRegistry } = await import('./tenant-runtime.js');
    const { runWithTenant } = await import('./tenant-context.js');
    const runtime = app.get(TenantRuntimeRegistry).byId(tenant.id);
    if (!runtime) throw new Error(`runtime for ${tenant.slug} missing`);
    return runWithTenant(runtime, fn);
  }

  async function signIn(tenant: TenantFixture, email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { host: tenant.apiHost, origin: `http://${tenant.panelHost}` },
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    return raw.map((c) => c.split(';')[0]).join('; ');
  }

  it('answers 404 TENANT_NOT_FOUND for an unknown host before touching any database (AC-005)', async () => {
    const res = await app.inject({ method: 'GET', url: '/me', headers: { host: 'unknown.test' } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'unknown.test' },
    });
    expect(health.statusCode).toBe(200);
  });

  it('keeps sessions inside their tenant: a cookie of alpha is anonymous on bravo (AC-006)', async () => {
    const { AuthService } = await import('../auth/auth.service.js');
    const auth = app.get(AuthService);
    await inTenant(a, () =>
      auth.createUser(
        {
          email: 'admin@alpha.test',
          name: 'Alpha admin',
          password: PASSWORD,
          roles: [{ role: 'ADMIN', scopeType: 'ENTERPRISE' }],
        },
        SYSTEM,
      ),
    );
    const cookie = await signIn(a, 'admin@alpha.test');
    const mine = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { host: a.apiHost, cookie },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ email: 'admin@alpha.test' });
    const crossed = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { host: b.apiHost, cookie },
    });
    expect(crossed.statusCode).toBe(401);
    // The user does not exist in bravo's database at all.
    const bravoLogin = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { host: b.apiHost, origin: `http://${b.panelHost}` },
      payload: { email: 'admin@alpha.test', password: PASSWORD },
    });
    expect(bravoLogin.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects a kiosk device token of alpha on bravo (AC-007)', async () => {
    const alpha = createDatabase(a.url, { max: 1 });
    try {
      // The same defaults provisioning seeds for a new tenant: a first site, templates, positions.
      const defaults = await seedTenantDefaults(alpha.db, { timezone: 'Europe/Kyiv' });
      await alpha.db.insert(qrTerminals).values({
        siteId: defaults.siteId,
        name: 'Gate',
        checkpoint: 'BOTH',
        deviceTokenHash: hashDeviceToken(DEVICE_TOKEN),
      });
    } finally {
      await alpha.client.end({ timeout: 5 });
    }
    const ok = await app.inject({
      method: 'GET',
      url: '/kiosk/challenge',
      headers: { host: a.apiHost, 'x-device-token': DEVICE_TOKEN },
    });
    expect(ok.statusCode).toBe(200);
    const crossed = await app.inject({
      method: 'GET',
      url: '/kiosk/challenge',
      headers: { host: b.apiHost, 'x-device-token': DEVICE_TOKEN },
    });
    expect(crossed.statusCode).toBe(401);
  });

  it('applies each tenant its own settings from its database (AC-028)', async () => {
    const alpha = createDatabase(a.url, { max: 1 });
    try {
      await alpha.db.insert(settings).values([
        { scope: 'global', key: 'tenant.qrRotationSeconds', value: 30 },
        // An invalid stored value falls back to the default instead of breaking the tenant.
        { scope: 'global', key: 'tenant.qrTtlSeconds', value: 'soon' },
      ]);
    } finally {
      await alpha.client.end({ timeout: 5 });
    }
    const runtimes = app.get(TenantRuntimeRegistry);
    const alphaRuntime = runtimes.byId(a.id);
    const bravoRuntime = runtimes.byId(b.id);
    if (!alphaRuntime || !bravoRuntime) throw new Error('Missing tenant runtime');
    alphaRuntime.settingsLoadedAt = 0;
    const challenge = await app.inject({
      method: 'GET',
      url: '/kiosk/challenge',
      headers: { host: a.apiHost, 'x-device-token': DEVICE_TOKEN },
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json()).toMatchObject({ rotationSeconds: 30 });
    expect(alphaRuntime.settings.qrTtlSeconds).toBe(TENANT_SETTING_DEFAULTS.qrTtlSeconds);
    await runtimes.prepare(bravoRuntime);
    expect(bravoRuntime.settings).toEqual(TENANT_SETTING_DEFAULTS);

    const cleanup = createDatabase(a.url, { max: 1 });
    try {
      await cleanup.db.delete(settings).where(eq(settings.scope, 'global'));
    } finally {
      await cleanup.client.end({ timeout: 5 });
    }
    alphaRuntime.settingsLoadedAt = 0;
    await runtimes.prepare(alphaRuntime);
    expect(alphaRuntime.settings.qrRotationSeconds).toBe(TENANT_SETTING_DEFAULTS.qrRotationSeconds);
  });

  it('accepts a webhook only on its own tenant host and only with that tenant secret (AC-008)', async () => {
    const update = { update_id: 1 };
    const wrongHost = await app.inject({
      method: 'POST',
      url: `/telegram/webhook/${a.id}`,
      headers: { host: b.apiHost, 'x-telegram-bot-api-secret-token': 'webhook-secret-alpha-0000' },
      payload: update,
    });
    expect(wrongHost.statusCode).toBe(404);
    const wrongSecret = await app.inject({
      method: 'POST',
      url: `/telegram/webhook/${a.id}`,
      headers: { host: a.apiHost, 'x-telegram-bot-api-secret-token': 'webhook-secret-bravo-0000' },
      payload: update,
    });
    expect(wrongSecret.statusCode).toBe(401);
  });

  it('allows only the tenant own panel origin in CORS (AC-010)', async () => {
    const own = await app.inject({
      method: 'OPTIONS',
      url: '/me',
      headers: {
        host: a.apiHost,
        origin: `http://${a.panelHost}`,
        'access-control-request-method': 'GET',
      },
    });
    expect(own.headers['access-control-allow-origin']).toBe(`http://${a.panelHost}`);
    const foreign = await app.inject({
      method: 'OPTIONS',
      url: '/me',
      headers: {
        host: a.apiHost,
        origin: `http://${b.panelHost}`,
        'access-control-request-method': 'GET',
      },
    });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('fails closed without a tenant context instead of using a default database (AC-009)', async () => {
    const { DATABASE } = await import('./database.module.js');
    const db = app.get<{ select: unknown }>(DATABASE);
    expect(() => db.select).toThrow(/No tenant is bound/);
  });

  it('closes kiosk and bot routes of a tenant whose module is off, without a deploy (AC-017, AC-018)', async () => {
    const { TenantRuntimeRegistry } = await import('./tenant-runtime.js');
    const setModules = async (status: ModuleStatus) => {
      await registry
        .update(tenantModules)
        .set({ status })
        .where(
          and(
            eq(tenantModules.tenantId, b.id),
            inArray(tenantModules.module, [TenantModule.QR_KIOSK, TenantModule.WORKER_BOT]),
          ),
        );
      await registry
        .update(tenants)
        .set({ updatedAt: sql`now()` })
        .where(eq(tenants.id, b.id));
      await app.get(TenantRuntimeRegistry).source.refresh();
    };
    const kiosk = (tenant: TenantFixture) =>
      app.inject({
        method: 'GET',
        url: '/kiosk/challenge',
        headers: { host: tenant.apiHost, 'x-device-token': 'unknown-device-token-0000' },
      });
    const webhook = (tenant: TenantFixture, secret: string) =>
      app.inject({
        method: 'POST',
        url: '/telegram/webhook',
        headers: { host: tenant.apiHost, 'x-telegram-bot-api-secret-token': secret },
        payload: { update_id: 1 },
      });

    await setModules(ModuleStatus.DISABLED);
    const closedKiosk = await kiosk(b);
    expect(closedKiosk.statusCode).toBe(403);
    expect(closedKiosk.json()).toMatchObject({ code: TenantErrorCode.MODULE_DISABLED });
    // A switched-off bot still rejects a wrong secret and drops genuine updates with 200.
    expect((await webhook(b, 'wrong-secret')).statusCode).toBe(401);
    expect((await webhook(b, 'webhook-secret-bravo-0000')).statusCode).toBe(200);
    // The other tenant still reaches its own checks behind the guard.
    expect((await kiosk(a)).statusCode).toBe(401);

    await setModules(ModuleStatus.ENABLED);
    expect((await kiosk(b)).statusCode).toBe(401);
  });

  it('refuses a suspended tenant within one refresh (AC-005, AC-023)', async () => {
    const { TenantRuntimeRegistry } = await import('./tenant-runtime.js');
    await registry
      .update(tenants)
      .set({
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: 'test',
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, b.id));
    await app.get(TenantRuntimeRegistry).source.refresh();
    const res = await app.inject({ method: 'GET', url: '/me', headers: { host: b.apiHost } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'TENANT_SUSPENDED' });
    const alive = await app.inject({ method: 'GET', url: '/me', headers: { host: a.apiHost } });
    expect(alive.statusCode).toBe(401);
  });
  it('rehearses env to registry and back with the same session, kiosk token and Redis/storage keys', async () => {
    const env = tenantFromEnv({
      DATABASE_URL: a.url,
      PUBLIC_BASE_URL: `http://${a.apiHost}`,
      CORS_ORIGINS: [`http://${a.panelHost}`],
    });
    const envPool = new TenantRuntimeRegistry(
      app.get(ConfigService),
      new EnvTenantSource(env),
      app.get(REDIS),
    );
    const legacy = envPool.byId(ENV_TENANT_ID);
    const registered = app.get(TenantRuntimeRegistry).byId(a.id);
    if (!legacy || !registered) throw new Error('Missing pilot runtime');
    try {
      const response = await legacy.auth.handler(
        new Request(`http://${a.apiHost}/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: `http://${a.panelHost}` },
          body: JSON.stringify({ email: 'admin@alpha.test', password: PASSWORD }),
        }),
      );
      expect(response.status).toBe(200);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      await legacy.store.set('cutover:pending', 'preserved', 60);
      expect(
        await runWithTenant(legacy, () => app.get(KioskService).issueChallenge(DEVICE_TOKEN)),
      ).not.toBeNull();
      expect(
        (await app.inject({ method: 'GET', url: '/me', headers: { host: a.apiHost, cookie } }))
          .statusCode,
      ).toBe(200);
      expect(await registered.store.get('cutover:pending')).toBe('preserved');
      expect(runWithTenant(registered, currentStoragePrefix)).toBe(
        runWithTenant(legacy, currentStoragePrefix),
      );
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/kiosk/challenge',
            headers: { host: a.apiHost, 'x-device-token': DEVICE_TOKEN },
          })
        ).statusCode,
      ).toBe(200);
      await registered.store.set('cutover:pending', 'registry-write', 60);
      expect(await legacy.store.get('cutover:pending')).toBe('registry-write');
      expect(await legacy.auth.api.getSession({ headers: new Headers({ cookie }) })).toMatchObject({
        user: { email: 'admin@alpha.test' },
      });
      expect(
        await runWithTenant(legacy, () => app.get(KioskService).issueChallenge(DEVICE_TOKEN)),
      ).not.toBeNull();
    } finally {
      await envPool.onApplicationShutdown();
    }
  });
});
