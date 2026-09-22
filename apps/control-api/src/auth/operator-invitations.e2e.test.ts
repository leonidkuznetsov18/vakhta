import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { verifyPassword } from 'better-auth/crypto';
import { OperatorRole, OperatorStatus } from '@vakhta/domain';
import { OperatorInvitationView } from '@vakhta/contracts';
import {
  createRegistry,
  migrateRegistry,
  generateSecretKeyHex,
  controlAuthUser,
  controlAuthAccount,
  controlAuthVerification,
  controlAuditLog,
  eq,
  type RegistryDatabase,
} from '@vakhta/registry';
import { ensureDockerHost } from '../../test/docker.js';
import { AUTH } from './auth.module.js';
import { createControlAuth, type ControlAuth } from './auth.config.js';
import { REGISTRY } from '../infra/registry.module.js';
import { ControlErrorFilter } from '../common/domain-error.js';
import { ControlAudit } from '../audit/audit.service.js';
import { OperatorInvitationsService } from './operator-invitations.service.js';

const PASSWORD = 'operator-chosen-password';
const actor = {
  id: randomUUID(),
  name: 'Administrator',
  email: 'admin@example.test',
  role: OperatorRole.PLATFORM_ADMIN,
};
const command = (email = `${randomUUID()}@example.test`) => ({
  email,
  name: 'Invited Operator',
  role: OperatorRole.PLATFORM_VIEWER,
});

describe('operator invitations', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let db: RegistryDatabase;
  let auth: ControlAuth;
  let service: OperatorInvitationsService;
  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('operator_invites')
      .start();
    const registry = createRegistry(postgres.getConnectionUri());
    await migrateRegistry(registry.db);
    await registry.client.end();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: postgres.getConnectionUri(),
      CONTROL_ENCRYPTION_KEY: generateSecretKeyHex(),
      CONTROL_AUTH_SECRET: 'operator-invitation-test-secret-at-least-32-characters',
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalFilters(new ControlErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(REGISTRY);
    auth = app.get(AUTH);
    service = app.get(OperatorInvitationsService);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  function session(role: OperatorRole = OperatorRole.PLATFORM_ADMIN, mfaVerified = true) {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({
      session: {
        id: randomUUID(),
        userId: actor.id,
        token: 'test-session',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaVerified,
      },
      user: {
        ...actor,
        role,
        status: OperatorStatus.ACTIVE,
        twoFactorEnabled: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
  async function issue() {
    return service.create(command(), actor);
  }
  function accept(token: string, password = PASSWORD) {
    return app.inject({
      method: 'POST',
      url: '/public/operator-invitations/accept',
      payload: { token, password },
    });
  }

  it('requires an MFA-verified administrator for create and reissue', async () => {
    const invitation = await issue();
    const calls = () =>
      Promise.all([
        app.inject({ method: 'POST', url: '/control/operators', payload: command() }),
        app.inject({
          method: 'POST',
          url: `/control/operators/${invitation.operatorId}/invitations`,
        }),
      ]);
    expect((await calls()).map((r) => r.statusCode)).toEqual([401, 401]);
    session(OperatorRole.PLATFORM_VIEWER);
    expect((await calls()).map((r) => r.statusCode)).toEqual([403, 403]);
    session(OperatorRole.PLATFORM_ADMIN, false);
    expect((await calls()).map((r) => r.statusCode)).toEqual([403, 403]);
    session();
    expect((await calls()).map((r) => r.statusCode)).toEqual([201, 201]);
  });

  it('normalizes email, refuses duplicates and invalid fields, and never returns tokens in lists', async () => {
    session();
    const payload = command('UPPER@example.test');
    const created = await app.inject({ method: 'POST', url: '/control/operators', payload });
    expect(created.statusCode).toBe(201);
    const invitation = OperatorInvitationView.parse(created.json());
    expect(created.headers['cache-control']).toBe('no-store');
    const duplicate = await app.inject({
      method: 'POST',
      url: '/control/operators',
      payload: { ...payload, email: 'upper@example.test' },
    });
    expect(duplicate.statusCode).toBe(409);
    const invalid = await app.inject({
      method: 'POST',
      url: '/control/operators',
      payload: { ...payload, role: 'ADMIN' },
    });
    expect(invalid.statusCode).toBe(400);
    const list = await app.inject({ method: 'GET', url: '/control/operators' });
    expect(list.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'upper@example.test', invitationPending: true }),
      ]),
    );
    expect(list.body).not.toContain(invitation.token);
    const verification = await db.select().from(controlAuthVerification);
    expect(JSON.stringify(verification)).not.toContain(invitation.token);
    const audit = await db.select().from(controlAuditLog);
    expect(JSON.stringify(audit)).not.toContain(invitation.token);
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
  });

  it('sets the first password once and still requires normal MFA enrollment', async () => {
    const invitation = await issue();
    const inspect = await app.inject({
      method: 'POST',
      url: '/public/operator-invitations/inspect',
      payload: { token: invitation.token },
    });
    expect(inspect.statusCode).toBe(201);
    expect(inspect.headers['cache-control']).toBe('no-store');
    expect(
      await db
        .select()
        .from(controlAuthAccount)
        .where(eq(controlAuthAccount.userId, invitation.operatorId)),
    ).toHaveLength(0);
    expect((await accept(invitation.token, 'short')).statusCode).toBe(400);
    expect((await accept(invitation.token)).statusCode).toBe(201);
    expect((await accept(invitation.token)).statusCode).toBe(404);
    await expect(service.reissue(invitation.operatorId, actor)).rejects.toMatchObject({
      code: 'INVITATION_UNAVAILABLE',
    });
    const [user] = await db
      .select()
      .from(controlAuthUser)
      .where(eq(controlAuthUser.id, invitation.operatorId));
    if (!user) throw new Error('Missing invited operator');
    const response = await auth.api.signInEmail({
      body: { email: user.email, password: PASSWORD },
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    const cookie = response.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');
    const me = await app.inject({
      method: 'GET',
      url: '/control/operators/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(403);
    const closedAuth = createControlAuth({
      db,
      secret: 'operator-invitation-test-secret-at-least-32-characters',
      baseURL: 'http://localhost:3100',
      trustedOrigins: [],
    });
    const signup = await closedAuth.api.signUpEmail({
      body: { ...command(), password: PASSWORD },
      asResponse: true,
    });
    expect(signup.ok).toBe(false);
  });

  it('invalidates prior links and rejects expired, disabled and unknown invitations', async () => {
    const first = await issue();
    const second = await service.reissue(first.operatorId, actor);
    expect((await accept(first.token)).statusCode).toBe(404);
    await db
      .update(controlAuthVerification)
      .set({ expiresAt: new Date(0) })
      .where(eq(controlAuthVerification.value, first.operatorId));
    expect((await accept(second.token)).statusCode).toBe(404);
    const third = await service.reissue(first.operatorId, actor);
    await db
      .update(controlAuthUser)
      .set({ status: OperatorStatus.DISABLED })
      .where(eq(controlAuthUser.id, first.operatorId));
    expect((await accept(third.token)).statusCode).toBe(404);
    await expect(service.reissue(first.operatorId, actor)).rejects.toMatchObject({
      code: 'INVITATION_UNAVAILABLE',
    });
    expect((await accept('a'.repeat(64))).statusCode).toBe(404);
  });

  it('allows exactly one concurrent acceptance without overwriting the winning password', async () => {
    const invitation = await issue();
    const passwords = [PASSWORD, 'another-operator-password'];
    const responses = await Promise.all(
      passwords.map((password) => accept(invitation.token, password)),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 404]);
    const accounts = await db
      .select()
      .from(controlAuthAccount)
      .where(eq(controlAuthAccount.userId, invitation.operatorId));
    expect(accounts).toHaveLength(1);
    const winningPassword =
      passwords[responses.findIndex((response) => response.statusCode === 201)];
    const hash = accounts[0]?.password;
    if (!hash || !winningPassword) throw new Error('Missing winner');
    expect(await verifyPassword({ hash, password: winningPassword })).toBe(true);
  });

  it('rolls back credentials and token consumption if audit fails, allowing an explicit retry', async () => {
    const invitation = await issue();
    vi.spyOn(app.get(ControlAudit), 'record').mockRejectedValueOnce(new Error('Audit unavailable'));
    expect((await accept(invitation.token)).statusCode).toBe(500);
    expect(
      await db
        .select()
        .from(controlAuthAccount)
        .where(eq(controlAuthAccount.userId, invitation.operatorId)),
    ).toHaveLength(0);
    expect((await accept(invitation.token)).statusCode).toBe(201);
  });
});
