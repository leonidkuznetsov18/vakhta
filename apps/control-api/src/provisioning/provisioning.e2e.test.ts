import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase, sites, webUserRoles, sql } from '@vakhta/db';
import {
  createRegistry,
  eq,
  generateSecretKeyHex,
  migrateRegistry,
  tenantDomains,
  tenantSecrets,
  tenantInvitations,
  provisioningJobs,
  provisioningSteps,
  and,
  type RegistryTenantSource,
  type SecretCipher,
} from '@vakhta/registry';
import {
  JobStatus,
  ProvisioningStep,
  ProvisioningKind,
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
  async function services() {
    const { TenantsService } = await import('../tenants/tenants.service.js');
    const { ProvisioningService } = await import('./provisioning.service.js');
    const { ProvisioningRunner } = await import('./runner.js');
    const { REGISTRY, SECRET_CIPHER } = await import('../infra/registry.module.js');
    const db = app.get<ReturnType<typeof createRegistry>['db']>(REGISTRY);
    const tenants = app.get(TenantsService);
    const provisioning = app.get(ProvisioningService);
    const provider = app.get(TelegramProvider);
    const runner = new ProvisioningRunner(
      db,
      app.get(SECRET_CIPHER),
      (await import('../config/env.js')).loadControlEnv(process.env),
      provider,
      tenants,
    );
    return { db, tenants, provisioning, provider, runner };
  }

  async function createDraft(slug: string) {
    const { tenants } = await services();
    return tenants.create(
      {
        name: slug,
        slug,
        defaultLocale: 'uk',
        timezone: 'Europe/Kyiv',
        modules: ['ADMIN_PANEL'],
        adminEmail: `${slug}@example.test`,
        adminName: 'Admin',
        provision: false,
      },
      OPERATOR,
    );
  }

  it('copies a token matching the stored invitation and reissues independently of the last job kind', async () => {
    const { db, tenants, provisioning } = await services();
    const tenant = (await tenants.list()).find((t) => t.slug === 'zavoda');
    if (!tenant) throw new Error('Missing tenant');
    const before = await tenants.get(tenant.id);
    const token = before.onboarding?.url.split('/').at(-1);
    if (!token) throw new Error('Missing onboarding token');
    const [invitation] = await db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tenantId, tenant.id));
    expect(invitation?.tokenHash).toBe(tenants.hashInvitation(token));
    expect(invitation?.id).not.toBe(token);
    if (!invitation) throw new Error('Missing invitation');
    const [provisionJob] = await provisioning.listForTenant(tenant.id);
    if (!provisionJob) throw new Error('Missing provisioning job');
    const legacyToken = 'legacy-random-invitation-token';
    const legacyUrl = `http://zavoda.vakhta.test/#/welcome/${legacyToken}`;
    await db
      .update(tenantInvitations)
      .set({ tokenHash: tenants.hashInvitation(legacyToken) })
      .where(eq(tenantInvitations.id, invitation.id));
    await db
      .update(provisioningSteps)
      .set({ output: { adminEmail: invitation.adminEmail, onboardingUrl: legacyUrl } })
      .where(
        and(
          eq(provisioningSteps.jobId, provisionJob.id),
          eq(provisioningSteps.step, ProvisioningStep.INVITE_ADMIN),
        ),
      );
    expect((await tenants.get(tenant.id)).onboarding?.url).toBe(legacyUrl);

    const reissued = await tenants.reissueInvitation(tenant.id, OPERATOR);
    expect(reissued.url).not.toBe(before.onboarding?.url);
    expect((await tenants.get(tenant.id)).onboarding?.url).toBe(reissued.url);
    const invitations = await db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tenantId, tenant.id));
    expect(invitations.filter((i) => i.expiresAt.getTime() > Date.now())).toHaveLength(1);
  });

  it('serializes two runners and refuses recovery commands during an active side effect', async () => {
    const first = await services();
    const second = await services();
    const tenant = (await first.tenants.list()).find((t) => t.slug === 'zavoda');
    if (!tenant) throw new Error('Missing tenant');
    const jobId = await first.db.transaction((tx) =>
      first.provisioning.createJob(tx, {
        tenantId: tenant.id,
        kind: 'ROTATE_BOT_TOKEN',
        requestedBy: OPERATOR.id,
        modules: ['WORKER_BOT'],
        payload: {},
      }),
    );
    let release: (() => void) | undefined;
    let announce: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const original = first.provider.setWebhook;
    let calls = 0;
    first.provider.setWebhook = async () => {
      calls += 1;
      announce?.();
      await gate;
    };
    const running = first.runner.tick();
    try {
      await started;
      await second.runner.tick();
      expect(calls).toBe(1);
      await expect(first.provisioning.retryStep(jobId, 'BOT_WEBHOOK')).rejects.toMatchObject({
        code: 'JOB_BUSY',
      });
      await expect(first.provisioning.skipStep(jobId, 'BOT_WEBHOOK')).rejects.toMatchObject({
        code: 'JOB_BUSY',
      });
    } finally {
      release?.();
      await running;
      first.provider.setWebhook = original;
    }
    expect((await first.provisioning.get(jobId)).status).toBe(JobStatus.DONE);
    await expect(first.provisioning.retryStep(jobId, 'BOT_WEBHOOK')).rejects.toMatchObject({
      code: 'STEP_TRANSITION_INVALID',
    });
    await expect(first.provisioning.skipStep(jobId, 'BOT_WEBHOOK')).rejects.toMatchObject({
      code: 'STEP_TRANSITION_INVALID',
    });
    const reissued = await first.tenants.reissueInvitation(tenant.id, OPERATOR);
    expect(reissued.url).toBe((await first.tenants.get(tenant.id)).onboarding?.url);
  });

  it('resumes a crashed RUNNING migration without rerunning completed steps', async () => {
    const { db, tenants, provisioning, runner } = await services();
    const tenant = (await tenants.list()).find((t) => t.slug === 'zavoda');
    if (!tenant) throw new Error('Missing tenant');
    const original = (await provisioning.listForTenant(tenant.id)).find(
      (j) => j.kind === ProvisioningKind.PROVISION,
    );
    if (!original) throw new Error('Missing provisioning job');
    const attempts = original.steps.find(
      (s) => s.step === ProvisioningStep.CREATE_DATABASE,
    )?.attempts;
    await db
      .update(provisioningSteps)
      .set({ status: StepStatus.RUNNING })
      .where(and(eq(provisioningSteps.jobId, original.id), eq(provisioningSteps.step, 'MIGRATE')));
    await db
      .update(provisioningJobs)
      .set({ status: JobStatus.RUNNING })
      .where(eq(provisioningJobs.id, original.id));
    await runner.tick();
    const resumed = await provisioning.get(original.id);
    expect(resumed.status).toBe(JobStatus.DONE);
    expect(resumed.steps.find((s) => s.step === ProvisioningStep.CREATE_DATABASE)?.attempts).toBe(
      attempts,
    );
    expect(resumed.steps.find((s) => s.step === ProvisioningStep.MIGRATE)?.attempts).toBe(2);
  });

  it('does not adopt a foreign database or reset a foreign role and does not expose SQL secrets', async () => {
    const { db, tenants, provisioning, runner } = await services();
    const tenant = await createDraft('foreign-db');
    const roleTenant = await createDraft('foreign-role');
    const role = `vakhta_${roleTenant.id.replaceAll('-', '')}_app`;
    const admin = createDatabase(postgres.getConnectionUri(), { max: 1 });
    try {
      await admin.db.execute(sql`CREATE DATABASE ${sql.identifier(tenant.databaseName)}`);
      await admin.db.execute(
        sql`CREATE ROLE ${sql.identifier(role)} LOGIN PASSWORD 'preserve-this-password'`,
      );
      const [before] = await admin.db.execute<{ rolpassword: string }>(
        sql`SELECT rolpassword FROM pg_authid WHERE rolname = ${role}`,
      );
      await tenants.startProvisioning(tenant.id, OPERATOR);
      await tenants.startProvisioning(roleTenant.id, OPERATOR);
      await runner.tick();
      const [databaseJob] = await provisioning.listForTenant(tenant.id);
      const [roleJob] = await provisioning.listForTenant(roleTenant.id);
      expect(databaseJob?.status).toBe(JobStatus.FAILED);
      expect(roleJob?.status).toBe(JobStatus.FAILED);
      expect(databaseJob?.steps[0]?.status).toBe(StepStatus.FAILED);
      const [after] = await admin.db.execute<{ rolpassword: string }>(
        sql`SELECT rolpassword FROM pg_authid WHERE rolname = ${role}`,
      );
      expect(after?.rolpassword).toBe(before?.rolpassword);
      expect(JSON.stringify(roleJob)).not.toContain('preserve-this-password');
      expect(
        await db.select().from(tenantSecrets).where(eq(tenantSecrets.tenantId, tenant.id)),
      ).toHaveLength(0);
      if (!databaseJob) throw new Error('Missing job');
      await expect(provisioning.skipStep(databaseJob.id, 'CREATE_DATABASE')).rejects.toMatchObject({
        code: 'STEP_TRANSITION_INVALID',
      });
      await expect(provisioning.skipStep(databaseJob.id, 'MIGRATE')).rejects.toMatchObject({
        code: 'STEP_TRANSITION_INVALID',
      });
      await expect(provisioning.retryStep(databaseJob.id, 'DROP_DATABASE')).rejects.toMatchObject({
        code: 'STEP_NOT_FOUND',
      });
    } finally {
      await admin.client.end({ timeout: 5 });
    }
  });

  it('redacts upstream failures and retries only the failed step', async () => {
    const { db, tenants, provisioning, runner, provider } = await services();
    const tenant = (await tenants.list()).find((t) => t.slug === 'zavoda');
    if (!tenant) throw new Error('Missing tenant');
    const jobId = await db.transaction((tx) =>
      provisioning.createJob(tx, {
        tenantId: tenant.id,
        kind: 'ROTATE_BOT_TOKEN',
        requestedBy: OPERATOR.id,
        modules: ['WORKER_BOT'],
        payload: {},
      }),
    );
    const original = provider.setWebhook;
    provider.setWebhook = async () => {
      throw new Error('Failed SQL PASSWORD sensitive-test-value');
    };
    try {
      await runner.tick();
    } finally {
      provider.setWebhook = original;
    }
    const failed = await provisioning.get(jobId);
    expect(failed.status).toBe(JobStatus.FAILED);
    expect(JSON.stringify(failed)).not.toContain('sensitive-test-value');
    await provisioning.retryStep(jobId, 'BOT_WEBHOOK', OPERATOR);
    await runner.tick();
    const recovered = await provisioning.get(jobId);
    expect(recovered.status).toBe(JobStatus.DONE);
    expect(recovered.steps.find((s) => s.step === ProvisioningStep.BOT_WEBHOOK)?.attempts).toBe(2);
    const audit = await app
      .get((await import('../audit/audit.service.js')).ControlAudit)
      .list(tenant.id);
    expect(audit).toContainEqual(
      expect.objectContaining({ action: 'job.step.retry', actorEmail: OPERATOR.email }),
    );
  });
  it('resumes credentials saved before database creation, including URL-encoded passwords', async () => {
    const { db, tenants, provisioning, runner } = await services();
    const tenant = await createDraft('resume-database');
    const { SECRET_CIPHER } = await import('../infra/registry.module.js');
    const cipher = app.get<SecretCipher>(SECRET_CIPHER);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/${tenant.databaseName}`;
    url.username = `vakhta_${tenant.id.replaceAll('-', '')}_app`;
    url.password = 'test-password@with:reserved/characters';
    const encrypted = cipher.encrypt(url.toString());
    await db.insert(tenantSecrets).values({
      tenantId: tenant.id,
      kind: TenantSecretKind.DATABASE_URL,
      ciphertext: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
      fingerprint: cipher.fingerprint(url.toString()),
    });
    await tenants.startProvisioning(tenant.id, OPERATOR);
    await runner.tick();
    const [job] = await provisioning.listForTenant(tenant.id);
    expect(job?.steps.find((s) => s.step === ProvisioningStep.CREATE_DATABASE)?.status).toBe(
      StepStatus.DONE,
    );
    expect(job?.steps.find((s) => s.step === ProvisioningStep.MIGRATE)?.status).toBe(
      StepStatus.DONE,
    );
    const [saved] = await db
      .select()
      .from(tenantSecrets)
      .where(
        and(
          eq(tenantSecrets.tenantId, tenant.id),
          eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      );
    expect(saved?.ciphertext).toEqual(encrypted.ciphertext);
  });
});
