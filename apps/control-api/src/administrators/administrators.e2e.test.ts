import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  auditLog,
  createDatabase,
  eq,
  migrateTenantDatabase,
  onboardingConsumptions,
  sql,
  webUserRoles,
} from '@vakhta/db';
import {
  createRegistry,
  generateSecretKeyHex,
  migrateRegistry,
  SecretCipher,
  tenantInvitations,
  tenantSecrets,
  type RegistryDatabase,
} from '@vakhta/registry';
import { OperatorRole, TenantSecretKind } from '@vakhta/domain';
import { TenantAdministratorError, TenantAdministratorsView } from '@vakhta/contracts';
import { ensureDockerHost } from '../../test/docker.js';
import { AUTH } from '../auth/auth.module.js';
import { REGISTRY } from '../infra/registry.module.js';
import { ControlErrorFilter } from '../common/domain-error.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { ControlAudit } from '../audit/audit.service.js';
import { AdministratorsService } from './administrators.service.js';

const actor = {
  id: randomUUID(),
  email: 'ops@example.test',
  name: 'Operator',
  role: OperatorRole.PLATFORM_ADMIN,
};
const INITIAL = 'initial-password-for-tests';
const CHANGED = 'changed-password-for-tests';
const Role = { ADMIN: 'ADMIN', HR: 'HR' } as const;
const Scope = { ENTERPRISE: 'ENTERPRISE', SITE: 'SITE' } as const;
const Provider = { CREDENTIAL: 'credential' } as const;
type Tenant = { id: string; handle: ReturnType<typeof createDatabase> };

describe('tenant administrator management', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let service: AdministratorsService;
  let alpha: Tenant;
  let beta: Tenant;
  let first: string;
  let second: string;
  let nonAdmin: string;
  let other: string;
  let registry: RegistryDatabase;

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    const control = createRegistry(postgres.getConnectionUri());
    await migrateRegistry(control.db);
    await control.client.end();
    const key = generateSecretKeyHex();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: postgres.getConnectionUri(),
      CONTROL_ENCRYPTION_KEY: key,
      CONTROL_AUTH_SECRET: 'administrators-test-secret-at-least-32-characters',
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
      PLATFORM_SCHEME: 'http',
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalFilters(new ControlErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = app.get(AdministratorsService);
    registry = app.get(REGISTRY);
    alpha = await createTenant('alpha', key);
    beta = await createTenant('beta', key);
    first = await seedUser(alpha, 'a@example.test', Role.ADMIN);
    second = await seedUser(alpha, 'b@example.test', Role.ADMIN);
    nonAdmin = await seedUser(alpha, 'hr@example.test', Role.HR);
    other = await seedUser(beta, 'a@example.test', Role.ADMIN);
  });
  afterAll(async () => {
    await alpha.handle.client.end();
    await beta.handle.client.end();
    await app.close();
    await postgres.stop();
  });

  async function createTenant(slug: string, key: string): Promise<Tenant> {
    const tenant = await app.get(TenantsService).create(
      {
        name: slug,
        slug,
        defaultLocale: 'en',
        timezone: 'Europe/Kyiv',
        modules: ['ADMIN_PANEL'],
        adminEmail: 'a@example.test',
        adminName: 'Administrator',
        provision: false,
      },
      actor,
    );
    await registry.execute(sql`CREATE DATABASE ${sql.identifier(tenant.databaseName)}`);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/${tenant.databaseName}`;
    await migrateTenantDatabase(url.toString());
    const cipher = new SecretCipher(key);
    await registry.insert(tenantSecrets).values({
      tenantId: tenant.id,
      kind: TenantSecretKind.DATABASE_URL,
      fingerprint: cipher.fingerprint(url.toString()),
      ...cipher.encrypt(url.toString()),
    });
    return { id: tenant.id, handle: createDatabase(url.toString()) };
  }
  async function seedUser(
    tenant: Tenant,
    email: string,
    role: (typeof Role)[keyof typeof Role],
  ): Promise<string> {
    const id = randomUUID();
    await tenant.handle.db.insert(authUser).values({ id, name: email, email });
    await tenant.handle.db.insert(authAccount).values({
      userId: id,
      providerId: Provider.CREDENTIAL,
      accountId: id,
      password: await hashPassword(INITIAL),
    });
    await tenant.handle.db
      .insert(webUserRoles)
      .values({ userId: id, role, scopeType: Scope.ENTERPRISE });
    return id;
  }
  function target(userId: string, tenant = alpha) {
    return { tenantId: tenant.id, userId, actor };
  }
  function authenticate(
    role: (typeof OperatorRole)[keyof typeof OperatorRole] = OperatorRole.PLATFORM_ADMIN,
  ) {
    return vi
      .spyOn(app.get<{ api: { getSession: () => Promise<unknown> } }>(AUTH).api, 'getSession')
      .mockResolvedValue({
        session: { mfaVerified: true },
        user: { ...actor, role, status: 'ACTIVE', twoFactorEnabled: true },
      });
  }

  it('requires MFA operator access and denies viewer mutations', async () => {
    const base = `/control/tenants/${alpha.id}/administrators`;
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(401);
    const session = authenticate(OperatorRole.PLATFORM_VIEWER);
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/${first}/password`,
          payload: { password: CHANGED },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `${base}/${first}` })).statusCode).toBe(403);
    session.mockResolvedValue({
      session: { mfaVerified: false },
      user: { ...actor, status: 'ACTIVE', twoFactorEnabled: true },
    });
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(403);
    session.mockRestore();
  });

  it('lists unique administrators, with no credentials or other-tenant users', async () => {
    await alpha.handle.db
      .insert(webUserRoles)
      .values({ userId: first, role: Role.ADMIN, scopeType: Scope.SITE, scopeId: randomUUID() });
    const result = TenantAdministratorsView.parse(await service.list(alpha.id, 1));
    expect(result.items.map((user) => user.id)).toEqual([first, second]);
    expect(result.total).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/password|credential|token/i);
    expect((await service.list(beta.id, 1)).items.map((user) => user.id)).toEqual([other]);
    await expect(service.setPassword(target(other), { password: CHANGED })).rejects.toMatchObject({
      code: TenantAdministratorError.NOT_FOUND,
    });
    await expect(service.remove(target(nonAdmin))).rejects.toMatchObject({
      code: TenantAdministratorError.NOT_FOUND,
    });
  });

  it('validates passwords and pagination at the HTTP boundary', async () => {
    const session = authenticate();
    const base = `/control/tenants/${alpha.id}/administrators`;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/${first}/password`,
          payload: { password: 'short' },
        })
      ).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${base}?page=-1` })).statusCode).toBe(400);
    session.mockRestore();
  });

  it('replaces only the selected credential, revokes sessions and invalidates setup links', async () => {
    const issued = await app
      .get(TenantsService)
      .issueInvitation({ tenantId: alpha.id, adminEmail: 'a@example.test', actor });
    await alpha.handle.db
      .insert(authSession)
      .values({ userId: first, token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) });
    await alpha.handle.db.insert(authVerification).values({
      identifier: '2fa-pending-challenge',
      value: first,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await service.setPassword(target(first), { password: CHANGED });
    const [account] = await alpha.handle.db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, first));
    expect(await verifyPassword({ hash: account?.password ?? '', password: CHANGED })).toBe(true);
    expect(await verifyPassword({ hash: account?.password ?? '', password: INITIAL })).toBe(false);
    expect(
      await alpha.handle.db.select().from(authSession).where(eq(authSession.userId, first)),
    ).toHaveLength(0);
    expect(
      await alpha.handle.db
        .select()
        .from(authVerification)
        .where(eq(authVerification.value, first)),
    ).toHaveLength(0);
    const [invitation] = await registry
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tokenHash, app.get(TenantsService).hashInvitation(issued.token)));
    expect(invitation?.usedAt).toBeInstanceOf(Date);
    expect(await alpha.handle.db.select().from(onboardingConsumptions)).toHaveLength(1);
    const [otherAccount] = await beta.handle.db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, other));
    expect(await verifyPassword({ hash: otherAccount?.password ?? '', password: INITIAL })).toBe(
      true,
    );
    const audit = await alpha.handle.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(CHANGED);
    expect(JSON.stringify(await app.get(ControlAudit).list(alpha.id))).not.toContain(CHANGED);
  });

  it('retains durable tenant audit and consumed-link evidence if registry completion fails', async () => {
    const invitation = await app
      .get(TenantsService)
      .issueInvitation({ tenantId: alpha.id, adminEmail: 'a@example.test', actor });
    const record = vi
      .spyOn(app.get(ControlAudit), 'record')
      .mockRejectedValueOnce(new Error('Registry audit unavailable'));
    await expect(
      service.setPassword(target(first), { password: 'recovery-password-for-tests' }),
    ).rejects.toThrow('Registry audit unavailable');
    record.mockRestore();
    const [account] = await alpha.handle.db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, first));
    expect(
      await verifyPassword({
        hash: account?.password ?? '',
        password: 'recovery-password-for-tests',
      }),
    ).toBe(true);
    expect(await alpha.handle.db.select().from(auditLog)).toHaveLength(2);
    expect(await alpha.handle.db.select().from(onboardingConsumptions)).toHaveLength(2);
    const [pending] = await registry
      .select()
      .from(tenantInvitations)
      .where(
        eq(tenantInvitations.tokenHash, app.get(TenantsService).hashInvitation(invitation.token)),
      );
    expect(pending?.usedAt).toBeNull();
    expect(
      await alpha.handle.db
        .select()
        .from(onboardingConsumptions)
        .where(eq(onboardingConsumptions.invitationId, pending?.id ?? randomUUID())),
    ).toHaveLength(1);
  });

  it('serializes concurrent deletions, preserves historical identity and protects the last administrator', async () => {
    const results = await Promise.allSettled([
      service.remove(target(first)),
      service.remove(target(second)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const remaining = await service.list(alpha.id, 1);
    expect(remaining.total).toBe(1);
    expect(remaining.items[0]?.canDelete).toBe(false);
    const removed = remaining.items[0]?.id === first ? second : first;
    expect(
      await alpha.handle.db.select().from(authAccount).where(eq(authAccount.userId, removed)),
    ).toHaveLength(0);
    expect(
      await alpha.handle.db.select().from(webUserRoles).where(eq(webUserRoles.userId, removed)),
    ).toHaveLength(0);
    expect(
      await alpha.handle.db.select().from(authUser).where(eq(authUser.id, removed)),
    ).toHaveLength(1);
    expect((await service.list(beta.id, 1)).total).toBe(1);
  });
  it('paginates the complete administrator collection with a stable total', async () => {
    const users = Array.from({ length: 21 }, (_, index) => ({
      id: randomUUID(),
      name: `Admin ${index}`,
      email: `page-${index}@example.test`,
    }));
    await alpha.handle.db.insert(authUser).values(users);
    await alpha.handle.db
      .insert(webUserRoles)
      .values(
        users.map((user) => ({ userId: user.id, role: Role.ADMIN, scopeType: Scope.ENTERPRISE })),
      );
    const one = await service.list(alpha.id, 1);
    const two = await service.list(alpha.id, 2);
    expect(one.total).toBe(22);
    expect(two.total).toBe(22);
    expect(one.items).toHaveLength(20);
    expect(two.items).toHaveLength(2);
    expect(new Set([...one.items, ...two.items].map((user) => user.id)).size).toBe(22);
  });
});
