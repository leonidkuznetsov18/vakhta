import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TENANT_SETTING_DEFAULTS } from '@vakhta/contracts';
import { createDatabase, migrateTenantDatabase, settings, sql } from '@vakhta/db';
import { OperatorRole } from '@vakhta/domain';
import {
  SecretCipher,
  controlAuditLog,
  createRegistry,
  desc,
  eq,
  generateSecretKeyHex,
  migrateRegistry,
  registerExistingTenant,
} from '@vakhta/registry';
import type { Operator } from '../auth/operator.guard.js';
import { ensureDockerHost } from '../../test/docker.js';
import { TenantSettingsService } from './tenant-settings.service.js';

const OPERATOR: Operator = {
  id: 'b0000000-0000-4000-8000-000000000009',
  email: 'ops@vakhta.test',
  name: 'Ops',
  role: OperatorRole.PLATFORM_ADMIN,
};

function withDatabase(uri: string, database: string): string {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Parameters tab backend (spec AC-026–028): values live in the tenant's own database. */
describe('control-api: tenant settings', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let service: TenantSettingsService;
  let tenantUrl: string;
  let tenantId: string;
  let closeRegistry: () => Promise<void>;
  let registry: ReturnType<typeof createRegistry>['db'];

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    const adminUrl = postgres.getConnectionUri();
    const admin = createDatabase(adminUrl, { max: 1 });
    await admin.db.execute(sql`CREATE DATABASE tenant_zavoda`);
    await admin.client.end({ timeout: 5 });
    tenantUrl = withDatabase(adminUrl, 'tenant_zavoda');
    await migrateTenantDatabase(tenantUrl);
    const key = generateSecretKeyHex();
    const control = createRegistry(adminUrl, { max: 2 });
    registry = control.db;
    closeRegistry = () => control.client.end({ timeout: 5 });
    await migrateRegistry(registry);
    const tenant = await registerExistingTenant(registry, new SecretCipher(key), {
      slug: 'zavoda',
      name: 'ZavodA',
      timezone: 'Europe/Kyiv',
      defaultLocale: 'uk',
      databaseUrl: tenantUrl,
      apiHost: 'zavoda-api.vakhta.test',
    });
    tenantId = tenant.id;
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: adminUrl,
      CONTROL_ENCRYPTION_KEY: key,
      CONTROL_AUTH_SECRET: 'control-test-secret-at-least-32-characters-long',
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
      PLATFORM_SCHEME: 'http',
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
      abortOnError: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = app.get(TenantSettingsService);
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await closeRegistry();
    await postgres.stop();
  });

  async function storedRows(): Promise<{ key: string; value: unknown }[]> {
    const handle = createDatabase(tenantUrl, { max: 1 });
    try {
      return await handle.db.select({ key: settings.key, value: settings.value }).from(settings);
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  }

  it('is closed without an operator session', async () => {
    const res = await app.inject({ method: 'GET', url: `/control/tenants/${tenantId}/settings` });
    expect(res.statusCode).toBe(401);
  });

  it('shows platform defaults for a tenant without overrides', async () => {
    const view = await service.get(tenantId);
    expect(view.effective).toEqual(TENANT_SETTING_DEFAULTS);
    expect(view.overrides).toEqual({});
  });

  it('stores overrides in the tenant database, resets with null and audits both', async () => {
    const saved = await service.update(
      tenantId,
      { values: { qrRotationSeconds: 30, mealMinutes: 45 } },
      OPERATOR,
    );
    expect(saved.overrides).toEqual({ qrRotationSeconds: 30, mealMinutes: 45 });
    expect(saved.effective.qrRotationSeconds).toBe(30);
    expect((await storedRows()).map((r) => r.key).sort()).toEqual([
      'tenant.mealMinutes',
      'tenant.qrRotationSeconds',
    ]);

    const reset = await service.update(tenantId, { values: { mealMinutes: null } }, OPERATOR);
    expect(reset.overrides).toEqual({ qrRotationSeconds: 30 });
    expect(reset.effective.mealMinutes).toBe(TENANT_SETTING_DEFAULTS.mealMinutes);

    const audit = await registry
      .select()
      .from(controlAuditLog)
      .where(eq(controlAuditLog.action, 'tenant.settings.update'))
      .orderBy(desc(controlAuditLog.id));
    expect(audit).toHaveLength(2);
    expect(audit[0]?.before).toEqual({ mealMinutes: 45 });
    expect(audit[0]?.after).toEqual({ reset: ['mealMinutes'] });
    expect(audit[0]?.actorEmail).toBe(OPERATOR.email);
  });

  it('rejects out-of-range, unknown and inconsistent values without writing anything', async () => {
    const before = await storedRows();
    await expect(
      service.update(tenantId, { values: { mediaMinBrightness: 999 } }, OPERATOR),
    ).rejects.toMatchObject({ code: 'TENANT_SETTING_INVALID' });
    await expect(
      service.update(tenantId, { values: { payrollRate: 5 } }, OPERATOR),
    ).rejects.toMatchObject({ code: 'TENANT_SETTING_UNKNOWN' });
    // The QR would expire before the kiosk replaces it.
    await expect(
      service.update(tenantId, { values: { qrTtlSeconds: 20 } }, OPERATOR),
    ).rejects.toMatchObject({ code: 'TENANT_SETTINGS_INCONSISTENT' });
    expect(await storedRows()).toEqual(before);
  });

  it('serializes concurrent writers so their combination cannot break the QR rule', async () => {
    // Each change is valid against rotation 30 / lifetime 90 alone; together 60 > 50.
    const results = await Promise.allSettled([
      service.update(tenantId, { values: { qrRotationSeconds: 60 } }, OPERATOR),
      service.update(tenantId, { values: { qrTtlSeconds: 50 } }, OPERATOR),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'TENANT_SETTINGS_INCONSISTENT' },
    });
    const view = await service.get(tenantId);
    expect(view.effective.qrTtlSeconds).toBeGreaterThanOrEqual(view.effective.qrRotationSeconds);
    await service.update(
      tenantId,
      { values: { qrRotationSeconds: null, qrTtlSeconds: null } },
      OPERATOR,
    );
  });

  it('reports an invalid stored value and keeps the default in effect', async () => {
    const handle = createDatabase(tenantUrl, { max: 1 });
    try {
      await handle.db
        .insert(settings)
        .values({ scope: 'global', key: 'tenant.breakMinutes', value: 'fifteen' });
    } finally {
      await handle.client.end({ timeout: 5 });
    }
    const view = await service.get(tenantId);
    expect(view.invalid).toEqual(['breakMinutes']);
    expect(view.effective.breakMinutes).toBe(TENANT_SETTING_DEFAULTS.breakMinutes);
  });
});
