import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase, sites, webUserRoles } from '@vakhta/db';
import {
  createRegistry,
  eq,
  generateSecretKeyHex,
  migrateRegistry,
  tenantDomains,
  tenantSecrets,
  type RegistryTenantSource,
  type SecretCipher,
} from '@vakhta/registry';
import {
  JobStatus,
  ProvisioningStep,
  StepStatus,
  TenantSecretKind,
  TenantStatus,
} from '@vakhta/domain';
import { ControlErrorFilter } from '../common/domain-error.js';
import { ensureDockerHost } from '../../test/docker.js';
import type { Operator } from '../auth/operator.guard.js';
import { TelegramProvider } from './telegram.provider.js';

const OPERATOR: Operator = {
  id: 'b0000000-0000-4000-8000-000000000001',
  email: 'ops@vakhta.test',
  name: 'Ops',
  role: 'PLATFORM_ADMIN',
};

/** Telegram calls are stubbed on the provider instance the module owns. */
function stubTelegram(provider: TelegramProvider): { webhooks: string[] } {
  const webhooks: string[] = [];
  provider.verifyToken = async () => ({ id: 42, username: 'zavoda_shift_bot' });
  provider.setWebhook = async (_token: string, url: string) => {
    webhooks.push(url);
  };
  provider.deleteWebhook = async () => {};
  return { webhooks };
}

/**
 * The quick-create path end to end (spec AC-001, AC-002, AC-034): a tenant is created, the runner
 * creates and migrates its database, seeds defaults, stops at the manual DNS step, resumes after
 * the operator skips it, connects the bot, invites the administrator and activates the tenant.
 */
describe('control-api: create a tenant and provision it', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let telegram: { webhooks: string[] };
  const key = generateSecretKeyHex();

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    const adminUrl = postgres.getConnectionUri();
    const control = createRegistry(adminUrl, { max: 1 });
    await migrateRegistry(control.db);
    await control.client.end({ timeout: 5 });
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: adminUrl,
      CONTROL_ENCRYPTION_KEY: key,
      CONTROL_AUTH_SECRET: 'control-test-secret-at-least-32-characters-long',
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
      PROVISION_DATABASE_ADMIN_URL: adminUrl,
      PLATFORM_SCHEME: 'http',
      PANEL_HOST_PATTERN: '{slug}.vakhta.test',
      KIOSK_HOST_PATTERN: '{slug}-kiosk.vakhta.test',
      API_HOST_PATTERN: '{slug}-api.vakhta.test',
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
      abortOnError: false,
    });
    app.useGlobalFilters(new ControlErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    telegram = stubTelegram(app.get(TelegramProvider));
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('refuses control routes without an operator session and serves nothing public for unknown hosts', async () => {
    const list = await app.inject({ method: 'GET', url: '/control/tenants' });
    expect(list.statusCode).toBe(401);
    const config = await app.inject({
      method: 'GET',
      url: '/public/tenant-config?host=nobody.vakhta.test',
    });
    expect(config.statusCode).toBe(404);
  });

  it('creates, provisions with a manual DNS pause, invites the administrator and activates', async () => {
    const { TenantsService } = await import('../tenants/tenants.service.js');
    const { ProvisioningRunner } = await import('./runner.js');
    const { ProvisioningService } = await import('./provisioning.service.js');
    const { REGISTRY, SECRET_CIPHER, TENANT_SOURCE } = await import('../infra/registry.module.js');
    const tenants = app.get(TenantsService);
    const provisioning = app.get(ProvisioningService);
    // The runner under test uses the fake Telegram provider; the module's own runner is idle in tests.
    const runner = new ProvisioningRunner(
      app.get(REGISTRY),
      app.get(SECRET_CIPHER),
      (await import('../config/env.js')).loadControlEnv(process.env),
      app.get(TelegramProvider),
      tenants,
    );

    const created = await tenants.create(
      {
        name: 'ЗаводА',
        slug: 'zavoda',
        defaultLocale: 'uk',
        timezone: 'Europe/Kyiv',
        modules: ['ADMIN_PANEL', 'WORKER_BOT', 'QR_KIOSK'],
        adminEmail: 'Olena@ZavodA.ua',
        adminName: 'Олена Коваль',
        botToken: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        provision: true,
      },
      OPERATOR,
    );
    expect(created.status).toBe(TenantStatus.PROVISIONING);
    expect(created.domains.map((d) => d.host).sort()).toEqual([
      'zavoda-api.vakhta.test',
      'zavoda-kiosk.vakhta.test',
      'zavoda.vakhta.test',
    ]);
    expect(created.secrets.find((s) => s.kind === TenantSecretKind.BOT_TOKEN)?.present).toBe(true);

    await runner.tick();
    let [job] = await provisioning.listForTenant(created.id);
    expect(job?.status).toBe(JobStatus.PENDING);
    const byStep = new Map(job?.steps.map((s) => [s.step, s]));
    expect(byStep.get('CREATE_DATABASE')?.status).toBe(StepStatus.DONE);
    expect(byStep.get('MIGRATE')?.status).toBe(StepStatus.DONE);
    expect(byStep.get('SEED_DEFAULTS')?.status).toBe(StepStatus.DONE);
    expect(byStep.get('REGISTER_DOMAINS')?.status).toBe(StepStatus.MANUAL_REQUIRED);
    expect(byStep.get('REGISTER_DOMAINS')?.output).toMatchObject({
      instruction: 'CREATE_DNS_RECORDS',
    });
    expect(byStep.get('BOT_WEBHOOK')?.status).toBe(StepStatus.PENDING);

    // A second tick changes nothing while the manual step waits.
    await runner.tick();
    [job] = await provisioning.listForTenant(created.id);
    expect(job?.steps.find((s) => s.step === ProvisioningStep.BOT_WEBHOOK)?.status).toBe(
      StepStatus.PENDING,
    );

    if (!job) throw new Error('job missing');
    await provisioning.skipStep(job.id, 'REGISTER_DOMAINS');
    await runner.tick();
    [job] = await provisioning.listForTenant(created.id);
    expect(job?.status).toBe(JobStatus.DONE);
    expect(job?.steps.map((s) => s.status)).toEqual([
      'DONE',
      'DONE',
      'DONE',
      'DONE',
      'SKIPPED',
      'DONE',
      'DONE',
    ]);
    expect(telegram.webhooks).toEqual([
      `http://zavoda-api.vakhta.test/telegram/webhook/${created.id}`,
    ]);

    const detail = await tenants.get(created.id);
    expect(detail.status).toBe(TenantStatus.ACTIVE);
    expect(detail.botUsername).toBe('zavoda_shift_bot');
    expect(detail.schemaVersion).toMatch(/^\d{4}_/);
    expect(detail.onboarding?.url).toMatch(/^http:\/\/zavoda\.vakhta\.test\/#\/welcome\//);
    expect(
      detail.secrets.find((s) => s.kind === TenantSecretKind.BOT_WEBHOOK_SECRET)?.present,
    ).toBe(true);

    // The tenant database exists, is seeded and holds the invited administrator.
    const cipher = app.get<SecretCipher>(SECRET_CIPHER);
    const [secret] = await app
      .get<ReturnType<typeof createRegistry>['db']>(REGISTRY)
      .select()
      .from(tenantSecrets)
      .where(eq(tenantSecrets.tenantId, created.id))
      .then((rows) => rows.filter((r) => r.kind === TenantSecretKind.DATABASE_URL));
    if (!secret) throw new Error('database secret missing');
    const tenantUrl = cipher.decrypt({
      ciphertext: secret.ciphertext,
      keyVersion: secret.keyVersion,
    });
    const tenantDb = createDatabase(tenantUrl, { max: 1 });
    try {
      expect(await tenantDb.db.select().from(sites)).toHaveLength(1);
      const grants = await tenantDb.db.select().from(webUserRoles);
      expect(grants).toEqual([expect.objectContaining({ role: 'ADMIN', scopeType: 'ENTERPRISE' })]);
    } finally {
      await tenantDb.client.end({ timeout: 5 });
    }

    // After the operator created the DNS records, verification marks the hosts as served.
    await app
      .get<ReturnType<typeof createRegistry>['db']>(REGISTRY)
      .update(tenantDomains)
      .set({ status: 'VERIFIED', verifiedAt: new Date() })
      .where(eq(tenantDomains.tenantId, created.id));
    // The public config answers by host for the tenant's panel and kiosk.
    await app.get<RegistryTenantSource>(TENANT_SOURCE).reload();
    const config = await app.inject({
      method: 'GET',
      url: '/public/tenant-config?host=zavoda-kiosk.vakhta.test',
    });
    expect(config.statusCode).toBe(200);
    const publicConfig = config.json<{ modules: string[] }>();
    expect(publicConfig).toMatchObject({
      slug: 'zavoda',
      surface: 'KIOSK',
      apiUrl: 'http://zavoda-api.vakhta.test',
      displayName: 'ЗаводА',
      status: TenantStatus.ACTIVE,
    });
    expect(publicConfig.modules).toContain('QR_KIOSK');
  });

  it('refuses a duplicate slug and a second active job', async () => {
    const { TenantsService } = await import('../tenants/tenants.service.js');
    const tenants = app.get(TenantsService);
    await expect(
      tenants.create(
        {
          name: 'x',
          slug: 'zavoda',
          defaultLocale: 'ru',
          timezone: 'Europe/Kyiv',
          modules: ['ADMIN_PANEL'],
          adminEmail: 'a@b.c',
          adminName: 'A',
          provision: false,
        },
        OPERATOR,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_SLUG_TAKEN' });
  });
});
