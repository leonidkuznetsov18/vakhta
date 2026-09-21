import 'reflect-metadata';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createRegistry,
  migrateRegistry,
  generateSecretKeyHex,
  controlAuthUser,
  eq,
  and,
  provisioningSteps,
} from '@vakhta/registry';
import { ensureDockerHost } from '../../test/docker.js';
import { createControlAuth, type ControlAuth } from './auth.config.js';

const PASSWORD = 'control-test-password-with-32-characters';
const EMAIL = 'operator@control.test';

function cookiesOf(response: Response, previous = ''): string {
  const jar = new Map(
    previous
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const [key = '', ...value] = part.trim().split('=');
        return [key, value.join('=')];
      }),
  );
  for (const raw of response.headers.getSetCookie()) {
    const [key = '', ...value] = (raw.split(';')[0] ?? '').split('=');
    jar.set(key, value.join('='));
  }
  return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
}

describe('control authentication assurance', () => {
  let postgres: StartedPostgreSqlContainer;
  let registry: ReturnType<typeof createRegistry>;
  let app: NestFastifyApplication;
  let auth: ControlAuth;
  let verifiedCookie = '';

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    registry = createRegistry(postgres.getConnectionUri(), { max: 5 });
    await migrateRegistry(registry.db);
    const secret = 'control-auth-regression-secret-with-32-characters';
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: postgres.getConnectionUri(),
      CONTROL_ENCRYPTION_KEY: generateSecretKeyHex(),
      CONTROL_AUTH_SECRET: secret,
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
    });
    auth = createControlAuth({
      db: registry.db,
      secret,
      baseURL: 'http://localhost:3100',
      trustedOrigins: [],
      allowSignUp: true,
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await auth.api.signUpEmail({ body: { email: EMAIL, name: 'Operator', password: PASSWORD } });
  });

  afterAll(async () => {
    await app.close();
    await registry.client.end({ timeout: 5 });
    await postgres.stop();
  });

  async function status(cookie: string): Promise<number> {
    return (await app.inject({ method: 'GET', url: '/control/operators/me', headers: { cookie } }))
      .statusCode;
  }

  async function signIn(): Promise<Response> {
    return auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true });
  }

  it('binds enrollment and subsequent TOTP or backup-code verification to one session', async () => {
    const oldCookie = cookiesOf(await signIn());
    const setupCookie = cookiesOf(await signIn());
    expect(await status(oldCookie)).toBe(403);
    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD, method: 'totp' },
      headers: new Headers({ cookie: setupCookie }),
    });
    if (enabled.method !== 'totp') throw new Error('Expected TOTP enrollment');
    const totp = OTPAuth.URI.parse(enabled.totpURI);
    if (!(totp instanceof OTPAuth.TOTP)) throw new Error('Expected TOTP secret');
    const code = totp.generate();
    const wrong = await auth.api.verifyTOTP({
      body: { code: 'invalid' },
      headers: new Headers({ cookie: setupCookie }),
      asResponse: true,
    });
    expect(wrong.ok).toBe(false);
    expect(await status(setupCookie)).toBe(403);
    const enrolled = await auth.api.verifyTOTP({
      body: { code },
      headers: new Headers({ cookie: setupCookie }),
      asResponse: true,
    });
    expect(enrolled.ok).toBe(true);
    expect(await status(cookiesOf(enrolled, setupCookie))).toBe(200);
    expect(await status(oldCookie)).toBe(401);

    const challenge = await signIn();
    expect(await challenge.clone().json()).toMatchObject({ twoFactorRedirect: true });
    const challengeCookie = cookiesOf(challenge);
    expect(await status(challengeCookie)).toBe(401);
    const denied = await auth.api.verifyTOTP({
      body: { code: 'invalid' },
      headers: new Headers({ cookie: challengeCookie }),
      asResponse: true,
    });
    expect(denied.ok).toBe(false);
    expect(await status(cookiesOf(denied, challengeCookie))).toBe(401);
    const verified = await auth.api.verifyTOTP({
      body: { code },
      headers: new Headers({ cookie: challengeCookie }),
      asResponse: true,
    });
    expect(verified.ok).toBe(true);
    expect(await status(cookiesOf(verified, challengeCookie))).toBe(200);

    const recoveryCookie = cookiesOf(await signIn());
    const backupCode = enabled.backupCodes[0];
    if (!backupCode) throw new Error('Missing backup code');
    const recovered = await auth.api.verifyBackupCode({
      body: { code: backupCode },
      headers: new Headers({ cookie: recoveryCookie }),
      asResponse: true,
    });
    expect(recovered.ok).toBe(true);
    verifiedCookie = cookiesOf(recovered, recoveryCookie);
    expect(await status(verifiedCookie)).toBe(200);
  });
  it('redacts onboarding bearer tokens for viewers on all three read routes', async () => {
    const { TenantsService } = await import('../tenants/tenants.service.js');
    const { ProvisioningService } = await import('../provisioning/provisioning.service.js');
    const tenants = app.get(TenantsService);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: verifiedCookie }) });
    if (!session) throw new Error('Missing operator session');
    const operator = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: 'PLATFORM_ADMIN' as const,
    };
    const tenant = await tenants.create(
      {
        name: 'Private onboarding',
        slug: 'private-onboarding',
        defaultLocale: 'uk',
        timezone: 'Europe/Kyiv',
        modules: ['ADMIN_PANEL'],
        adminEmail: 'admin@tenant.test',
        adminName: 'Admin',
        provision: true,
      },
      operator,
    );
    const invitation = await tenants.issueInvitation({
      tenantId: tenant.id,
      adminEmail: 'admin@tenant.test',
      actor: operator,
    });
    const [job] = await app.get(ProvisioningService).listForTenant(tenant.id);
    if (!job) throw new Error('Missing job');
    await registry.db
      .update(provisioningSteps)
      .set({ output: { onboardingUrl: invitation.url, adminEmail: 'admin@tenant.test' } })
      .where(and(eq(provisioningSteps.jobId, job.id), eq(provisioningSteps.step, 'INVITE_ADMIN')));
    const urls = [
      `/control/tenants/${tenant.id}`,
      `/control/tenants/${tenant.id}/jobs`,
      `/control/jobs/${job.id}`,
    ];
    const viewerResponses = await Promise.all(
      urls.map((url) => app.inject({ method: 'GET', url, headers: { cookie: verifiedCookie } })),
    );
    for (const response of viewerResponses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(invitation.token);
    }
    expect(viewerResponses[0]?.json()).toMatchObject({ onboarding: null });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/control/tenants/${tenant.id}`,
          headers: { cookie: verifiedCookie },
          payload: { name: 'Unauthorized' },
        })
      ).statusCode,
    ).toBe(403);
    await registry.db
      .update(controlAuthUser)
      .set({ role: 'PLATFORM_ADMIN' })
      .where(eq(controlAuthUser.id, session.user.id));
    const adminResponses = await Promise.all(
      urls.map((url) => app.inject({ method: 'GET', url, headers: { cookie: verifiedCookie } })),
    );
    for (const response of adminResponses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(invitation.token);
    }
    await registry.db
      .update(controlAuthUser)
      .set({ status: 'DISABLED' })
      .where(eq(controlAuthUser.id, session.user.id));
    expect(await status(verifiedCookie)).toBe(403);
  });
});
