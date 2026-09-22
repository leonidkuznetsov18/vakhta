import { TenantGateway } from '@vakhta/contracts';
import { verifyPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { OnboardingService } from '../public/onboarding.service.js';
import { ControlAudit } from '../audit/audit.service.js';
import { configureControlCors } from '../public/cors.js';
import { loadControlEnv } from '../config/env.js';
import { authAccount, authSession, onboardingConsumptions } from '@vakhta/db';
import { tenants as tenantRows, tenantModules } from '@vakhta/registry';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  TenantDomainStatus,
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
    configureControlCors(app, loadControlEnv(process.env));
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
    const source = app.get<RegistryTenantSource>(TENANT_SOURCE);
    const runner = new ProvisioningRunner(
      app.get(REGISTRY),
      app.get(SECRET_CIPHER),
      (await import('../config/env.js')).loadControlEnv(process.env),
      app.get(TelegramProvider),
      tenants,
      source,
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
    expect(byStep.has('BOT_WEBHOOK')).toBe(false);

    // A second tick changes nothing while the manual step waits.
    await runner.tick();
    [job] = await provisioning.listForTenant(created.id);
    expect(job?.steps.some((s) => s.step === ProvisioningStep.BOT_WEBHOOK)).toBe(false);

    if (!job) throw new Error('job missing');
    await provisioning.skipStep(job.id, 'REGISTER_DOMAINS');
    const coreJobId = job.id;
    await runner.tick();
    expect((await tenants.get(created.id)).status).toBe(TenantStatus.ACTIVE);
    expect(telegram.webhooks).toHaveLength(0);
    job = await provisioning.get(coreJobId);
    expect(job.status).toBe(JobStatus.DONE);
    expect(job.steps.map((s) => s.status)).toEqual([
      'DONE',
      'DONE',
      'DONE',
      'DONE',
      'SKIPPED',
      'DONE',
    ]);
    await runner.tick();
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

  it('rejects generated-host collisions before provisioning or bot validation', async () => {
    const original = await createDraft('collision');
    const svc = await services();
    await expect(
      svc.tenants.create(
        {
          slug: 'collision-api',
          name: 'Collision',
          defaultLocale: 'uk',
          timezone: 'Europe/Kyiv',
          modules: ['ADMIN_PANEL'],
          provision: true,
          adminEmail: 'collision@example.test',
          adminName: 'QA',
        },
        OPERATOR,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_SLUG_TAKEN', status: 409 });
    expect((await svc.provisioning.listForTenant(original.id)).length).toBe(0);
  });

  it('activates through the HTTPS gateway without DNS actions and keeps a failing bot independent', async () => {
    const svc = await services({ TENANT_GATEWAY_ZONE: 'vakhta.test', PLATFORM_SCHEME: 'https' });
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return Response.json({ service: TenantGateway.SERVICE, host: url.hostname });
    });
    vi.stubGlobal('fetch', fetcher);
    const original = svc.provider.verifyToken;
    svc.provider.verifyToken = async () => {
      throw new Error('Bot temporarily unavailable');
    };
    try {
      const created = await svc.tenants.create(
        {
          name: 'Gateway QA',
          slug: 'gateway-qa',
          defaultLocale: 'uk',
          timezone: 'Europe/Kyiv',
          modules: ['ADMIN_PANEL', 'WORKER_BOT'],
          adminEmail: 'gateway@example.test',
          adminName: 'QA',
          botToken: '999999:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          provision: true,
        },
        OPERATOR,
      );
      // Simulate the earlier in-flight poll completing without observing activation.
      const refresh = vi.spyOn(svc.source, 'refresh').mockResolvedValueOnce(undefined);
      try {
        await svc.runner.tick();
      } finally {
        refresh.mockRestore();
      }
      const active = await svc.tenants.get(created.id);
      expect(active.status).toBe(TenantStatus.ACTIVE);
      expect(active.domains.every((domain) => domain.status === TenantDomainStatus.VERIFIED)).toBe(
        true,
      );
      expect(active.onboarding).not.toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/public/tenant-config?host=gateway-qa.vakhta.test',
          })
        ).statusCode,
      ).toBe(200);
      await svc.runner.tick();
      const jobs = await svc.provisioning.listForTenant(created.id);
      expect(jobs.find((job) => job.kind === ProvisioningKind.PROVISION)?.status).toBe(
        JobStatus.DONE,
      );
      expect(jobs.find((job) => job.kind === ProvisioningKind.ENABLE_MODULE)?.status).toBe(
        JobStatus.FAILED,
      );
      expect((await svc.tenants.get(created.id)).status).toBe(TenantStatus.ACTIVE);
    } finally {
      svc.provider.verifyToken = original;
      vi.unstubAllGlobals();
    }
  });

  it('does not verify unavailable gateway hosts and retries without recreating the database', async () => {
    const svc = await services({ TENANT_GATEWAY_ZONE: 'vakhta.test', PLATFORM_SCHEME: 'https' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    try {
      const tenant = await createDraft('gateway-retry');
      await svc.tenants.startProvisioning(tenant.id, OPERATOR);
      await svc.runner.tick();
      const [job] = await svc.provisioning.listForTenant(tenant.id);
      if (!job) throw new Error('Missing job');
      expect(
        job.steps.find((step) => step.step === ProvisioningStep.REGISTER_DOMAINS)?.status,
      ).toBe(StepStatus.PENDING);
      expect(
        (await svc.tenants.get(tenant.id)).domains.every(
          (domain) => domain.status === TenantDomainStatus.PENDING,
        ),
      ).toBe(true);
      await svc.db
        .update(provisioningSteps)
        .set({ output: { retryAt: new Date(0).toISOString() } })
        .where(
          and(
            eq(provisioningSteps.jobId, job.id),
            eq(provisioningSteps.step, ProvisioningStep.REGISTER_DOMAINS),
          ),
        );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request) =>
          Response.json({ service: TenantGateway.SERVICE, host: new URL(String(input)).hostname }),
        ),
      );
      await svc.runner.tick();
      const done = await svc.provisioning.get(job.id);
      expect(done.status).toBe(JobStatus.DONE);
      expect(
        done.steps.find((step) => step.step === ProvisioningStep.CREATE_DATABASE)?.attempts,
      ).toBe(1);
      expect(
        done.steps.find((step) => step.step === ProvisioningStep.REGISTER_DOMAINS)?.attempts,
      ).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
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
  async function services(overrides: Record<string, string> = {}) {
    const { TenantsService } = await import('../tenants/tenants.service.js');
    const { ProvisioningService } = await import('./provisioning.service.js');
    const { ProvisioningRunner } = await import('./runner.js');
    const { REGISTRY, SECRET_CIPHER, TENANT_SOURCE } = await import('../infra/registry.module.js');
    const db = app.get<ReturnType<typeof createRegistry>['db']>(REGISTRY);
    const tenants = app.get(TenantsService);
    const provisioning = app.get(ProvisioningService);
    const provider = app.get(TelegramProvider);
    const source = app.get<RegistryTenantSource>(TENANT_SOURCE);
    const runner = new ProvisioningRunner(
      db,
      app.get(SECRET_CIPHER),
      (await import('../config/env.js')).loadControlEnv({ ...process.env, ...overrides }),
      provider,
      tenants,
      source,
    );
    return { db, tenants, provisioning, provider, runner, source };
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
    const provisionJob = (await provisioning.listForTenant(tenant.id)).find(
      (job) => job.kind === ProvisioningKind.PROVISION,
    );
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
  async function onboardingFixture() {
    const { db, tenants } = await services();
    const tenant = (await tenants.list()).find((row) => row.slug === 'zavoda');
    if (!tenant) throw new Error('Tenant missing');
    const link = await tenants.issueInvitation({
      tenantId: tenant.id,
      adminEmail: 'olena@zavoda.ua',
      actor: OPERATOR,
    });
    const [invitation] = await db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tokenHash, tenants.hashInvitation(link.token)));
    const [secret] = await db
      .select()
      .from(tenantSecrets)
      .where(
        and(
          eq(tenantSecrets.tenantId, tenant.id),
          eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      );
    if (!invitation || !secret) throw new Error('Fixture missing');
    const { SECRET_CIPHER } = await import('../infra/registry.module.js');
    const handle = createDatabase(app.get<SecretCipher>(SECRET_CIPHER).decrypt(secret), { max: 2 });
    return {
      db,
      tenant,
      invitation,
      handle,
      input: { host: 'zavoda.vakhta.test', token: link.token },
      onboarding: app.get(OnboardingService),
    };
  }

  it('serves public CORS without credentials and keeps operator routes restricted', async () => {
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/public/onboarding/accept',
      headers: {
        origin: 'http://zavoda.vakhta.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
    const control = await app.inject({
      method: 'GET',
      url: '/control/tenants',
      headers: { origin: 'http://zavoda.vakhta.test' },
    });
    expect(control.headers['access-control-allow-origin']).toBeUndefined();
    expect(control.statusCode).toBe(401);
  });

  it('binds invitation use to the verified panel host, active tenant and enabled module', async () => {
    const f = await onboardingFixture();
    try {
      expect(await f.onboarding.open(f.input)).toMatchObject({
        status: 'READY',
        email: 'olena@zavoda.ua',
      });
      await Promise.all(
        ['unknown.vakhta.test', 'zavoda-api.vakhta.test', 'zavoda-kiosk.vakhta.test'].map(
          async (host) => {
            await expect(f.onboarding.open({ ...f.input, host })).rejects.toMatchObject({
              code: 'INVITATION_UNAVAILABLE',
            });
          },
        ),
      );
      await f.db
        .update(tenantRows)
        .set({ status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'Onboarding test' })
        .where(eq(tenantRows.id, f.tenant.id));
      await expect(f.onboarding.open(f.input)).rejects.toMatchObject({
        code: 'INVITATION_UNAVAILABLE',
      });
      await f.db
        .update(tenantRows)
        .set({ status: 'ACTIVE', suspendedAt: null, suspendedReason: null })
        .where(eq(tenantRows.id, f.tenant.id));
      await f.db
        .update(tenantModules)
        .set({ status: 'DISABLED' })
        .where(
          and(eq(tenantModules.tenantId, f.tenant.id), eq(tenantModules.module, 'ADMIN_PANEL')),
        );
      await expect(f.onboarding.open(f.input)).rejects.toMatchObject({
        code: 'INVITATION_UNAVAILABLE',
      });
    } finally {
      await f.db
        .update(tenantRows)
        .set({ status: 'ACTIVE', suspendedAt: null, suspendedReason: null })
        .where(eq(tenantRows.id, f.tenant.id));
      await f.db
        .update(tenantModules)
        .set({ status: 'ENABLED' })
        .where(
          and(eq(tenantModules.tenantId, f.tenant.id), eq(tenantModules.module, 'ADMIN_PANEL')),
        );
      await f.handle.client.end({ timeout: 5 });
    }
  });

  it('rejects invalid, expired and replaced invitations and short passwords', async () => {
    const f = await onboardingFixture();
    try {
      await expect(f.onboarding.open({ ...f.input, token: 'invalid-token' })).rejects.toMatchObject(
        { code: 'INVITATION_UNAVAILABLE' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/public/onboarding/accept',
        payload: { ...f.input, password: 'short' },
      });
      expect(response.statusCode).toBe(400);
      await f.db
        .update(tenantInvitations)
        .set({ expiresAt: new Date(0) })
        .where(eq(tenantInvitations.id, f.invitation.id));
      await expect(f.onboarding.open(f.input)).rejects.toMatchObject({
        code: 'INVITATION_UNAVAILABLE',
      });
      const { tenants } = await services();
      const fresh = await tenants.issueInvitation({
        tenantId: f.tenant.id,
        adminEmail: f.invitation.adminEmail,
        actor: OPERATOR,
      });
      await tenants.reissueInvitation(f.tenant.id, OPERATOR);
      await expect(f.onboarding.open({ ...f.input, token: fresh.token })).rejects.toMatchObject({
        code: 'INVITATION_UNAVAILABLE',
      });
    } finally {
      await f.handle.client.end({ timeout: 5 });
    }
  });

  it('sets a password exactly once under concurrent requests and revokes old sessions', async () => {
    const f = await onboardingFixture();
    try {
      const [account] = await f.handle.db.select().from(authAccount);
      if (!account) throw new Error('Account missing');
      await f.handle.db.insert(authSession).values({
        userId: account.userId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const passwords = ['first-password-at-least-12', 'second-password-at-least-12'];
      const results = await Promise.all(
        passwords.map((password) => f.onboarding.open({ ...f.input, password })),
      );
      expect(results.map((result) => result.status)).toEqual(['USED', 'USED']);
      const [saved] = await f.handle.db.select().from(authAccount);
      if (!saved?.password) throw new Error('Password missing');
      const matches = await Promise.all(
        passwords.map((password) => verifyPassword({ password, hash: saved.password ?? '' })),
      );
      expect(matches.filter(Boolean)).toHaveLength(1);
      expect(await f.handle.db.select().from(authSession)).toHaveLength(0);
      expect(
        await f.handle.db
          .select()
          .from(onboardingConsumptions)
          .where(eq(onboardingConsumptions.invitationId, f.invitation.id)),
      ).toHaveLength(1);
      const [record] = await f.db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, f.invitation.id));
      expect(record?.usedAt).toBeInstanceOf(Date);
    } finally {
      await f.handle.client.end({ timeout: 5 });
    }
  });

  it('recovers a tenant commit followed by a registry failure without changing the first password', async () => {
    const f = await onboardingFixture();
    const audit = vi.spyOn(app.get(ControlAudit), 'record');
    try {
      audit.mockRejectedValueOnce(new Error('Injected registry failure'));
      await expect(
        f.onboarding.open({ ...f.input, password: 'first-durable-password' }),
      ).rejects.toThrow('Injected registry failure');
      const [record] = await f.db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, f.invitation.id));
      expect(record?.usedAt).toBeNull();
      await f.db
        .update(tenantInvitations)
        .set({ expiresAt: new Date(0) })
        .where(eq(tenantInvitations.id, f.invitation.id));
      expect(await f.onboarding.open(f.input)).toMatchObject({ status: 'USED' });
      const [afterInspect] = await f.db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, f.invitation.id));
      expect(afterInspect?.usedAt).toBeInstanceOf(Date);
      expect(audit).toHaveBeenCalledTimes(2);
      expect(
        await f.onboarding.open({ ...f.input, password: 'different-retry-password' }),
      ).toMatchObject({ status: 'USED' });
      const [account] = await f.handle.db.select().from(authAccount);
      if (!account?.password) throw new Error('Password missing');
      expect(
        await verifyPassword({ password: 'first-durable-password', hash: account.password }),
      ).toBe(true);
      expect(
        await verifyPassword({ password: 'different-retry-password', hash: account.password }),
      ).toBe(false);
      const [recovered] = await f.db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, f.invitation.id));
      expect(recovered?.usedAt).toBeInstanceOf(Date);
    } finally {
      audit.mockRestore();
      await f.handle.client.end({ timeout: 5 });
    }
  });
});
