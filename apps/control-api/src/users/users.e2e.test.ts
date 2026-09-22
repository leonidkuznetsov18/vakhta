import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authAccount,
  authUser,
  createDatabase,
  employees,
  eq,
  mediaObjects,
  migrateTenantDatabase,
  sql,
  webUserRoles,
} from '@vakhta/db';
import {
  createRegistry,
  generateSecretKeyHex,
  migrateRegistry,
  SecretCipher,
  tenantSecrets,
  tenants,
  type RegistryDatabase,
} from '@vakhta/registry';
import { OperatorRole, TenantSecretKind, WebRole, WEB_ROLES } from '@vakhta/domain';
import {
  TenantUserAvailability,
  TenantUserGroup,
  TenantUsersQuery,
  TenantUsersView,
} from '@vakhta/contracts';
import { ensureDockerHost } from '../../test/docker.js';
import { AUTH } from '../auth/auth.module.js';
import { REGISTRY } from '../infra/registry.module.js';
import { ControlErrorFilter } from '../common/domain-error.js';
import { TenantUsersService } from './users.service.js';

const Scope = { ENTERPRISE: 'ENTERPRISE', SITE: 'SITE' } as const;
const Status = { ACTIVE: 'ACTIVE', BLOCKED: 'BLOCKED', TERMINATED: 'TERMINATED' } as const;
const Provider = { CREDENTIAL: 'credential' } as const;
const Purpose = { EMPLOYEE_AVATAR: 'EMPLOYEE_AVATAR' } as const;
type Tenant = { id: string; handle: ReturnType<typeof createDatabase> };

describe('tenant user inventory', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let service: TenantUsersService;
  let registry: RegistryDatabase;
  let alpha: Tenant;
  let beta: Tenant;
  let draftId: string;
  let brokenId: string;
  let firstAdmin: string;

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
      CONTROL_AUTH_SECRET: 'users-test-secret-at-least-32-characters',
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
    service = app.get(TenantUsersService);
    registry = app.get(REGISTRY);
    alpha = await tenant('alpha', key);
    beta = await tenant('beta', key);
    draftId = await registryTenant('draft');
    brokenId = await registryTenant('broken');
    const cipher = new SecretCipher(key);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = '/missing_database';
    await registry.insert(tenantSecrets).values({
      tenantId: brokenId,
      kind: TenantSecretKind.DATABASE_URL,
      ...cipher.encrypt(url.toString()),
      fingerprint: cipher.fingerprint(url.toString()),
    });
    await seed();
  });
  afterAll(async () => {
    await alpha.handle.client.end();
    await beta.handle.client.end();
    await app.close();
    await postgres.stop();
  });

  async function registryTenant(slug: string) {
    const id = randomUUID();
    await registry.insert(tenants).values({
      id,
      slug,
      timezone: 'Europe/Kyiv',
      name: slug,
      databaseName: `vakhta_t_${slug}`,
      storagePrefix: `tenants/${slug}`,
    });
    return id;
  }
  async function tenant(slug: string, key: string): Promise<Tenant> {
    const id = await registryTenant(slug);
    await registry.execute(sql`CREATE DATABASE ${sql.identifier(`vakhta_t_${slug}`)}`);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/vakhta_t_${slug}`;
    await migrateTenantDatabase(url.toString());
    const cipher = new SecretCipher(key);
    await registry.insert(tenantSecrets).values({
      tenantId: id,
      kind: TenantSecretKind.DATABASE_URL,
      ...cipher.encrypt(url.toString()),
      fingerprint: cipher.fingerprint(url.toString()),
    });
    return { id, handle: createDatabase(url.toString()) };
  }
  async function seed() {
    await alpha.handle.db.insert(employees).values(
      Array.from({ length: 1000 }, (_, index) => ({
        fullName: `Worker ${String(index).padStart(4, '0')}`,
        personnelNumber: String(index),
        email: index === 0 ? 'admin-0@example.test' : null,
      })),
    );
    await alpha.handle.db.insert(employees).values([
      { fullName: 'Blocked', personnelNumber: 'blocked', status: Status.BLOCKED },
      { fullName: 'Terminated', personnelNumber: 'terminated', status: Status.TERMINATED },
    ]);
    const roles = [
      WebRole.ADMIN,
      WebRole.ADMIN,
      WebRole.ADMIN,
      WebRole.ADMIN,
      WebRole.ADMIN,
      WebRole.HR,
      WebRole.HR,
      WebRole.SHIFT_MASTER,
      WebRole.SHIFT_MASTER,
      WebRole.ACCOUNTANT,
      WebRole.ACCOUNTANT,
    ];
    const users = roles.map((role, index) => ({
      id: randomUUID(),
      name: `${role} ${index}`,
      email: `admin-${index}@example.test`,
    }));
    firstAdmin = users[0]?.id ?? '';
    await alpha.handle.db.insert(authUser).values(users);
    await alpha.handle.db.insert(authAccount).values(
      users.map((user) => ({
        userId: user.id,
        accountId: user.id,
        providerId: Provider.CREDENTIAL,
        password: 'fixture-hash',
      })),
    );
    await alpha.handle.db.insert(webUserRoles).values(
      users.map((user, index) => ({
        userId: user.id,
        role: roles[index] ?? WebRole.ADMIN,
        scopeType: Scope.ENTERPRISE,
      })),
    );
    await alpha.handle.db.insert(webUserRoles).values([
      { userId: firstAdmin, role: WebRole.ADMIN, scopeType: Scope.SITE, scopeId: randomUUID() },
      { userId: firstAdmin, role: WebRole.HR, scopeType: Scope.ENTERPRISE },
    ]);
    const removed = randomUUID();
    const noRole = randomUUID();
    await alpha.handle.db.insert(authUser).values([
      { id: removed, name: 'Removed access', email: 'removed@example.test' },
      { id: noRole, name: 'No role', email: 'no-role@example.test' },
    ]);
    await alpha.handle.db.insert(webUserRoles).values({ userId: removed, role: WebRole.ADMIN });
    await alpha.handle.db.insert(authAccount).values({
      userId: noRole,
      accountId: noRole,
      providerId: Provider.CREDENTIAL,
      password: 'fixture-hash',
    });
    await beta.handle.db
      .insert(employees)
      .values({ fullName: 'Other tenant', personnelNumber: '0' });
  }

  it('counts all active seats once, while role groups overlap and inactive access is excluded', async () => {
    const [result] = await service.counts([alpha.id]);
    expect(result?.status).toBe(TenantUserAvailability.READY);
    if (result?.status !== TenantUserAvailability.READY) throw new Error('Counts unavailable');
    expect(result.counts).toMatchObject({ workers: 1000, panel: 11, total: 1011 });
    expect(result.counts.roles).toHaveLength(WEB_ROLES.length);
    expect(result.counts.roles).toContainEqual({ role: WebRole.ADMIN, count: 5 });
    expect(result.counts.roles).toContainEqual({ role: WebRole.HR, count: 3 });
  });
  it('paginates and searches the selected tenant without merging matching email addresses', async () => {
    const query = TenantUsersQuery.parse({});
    const first = TenantUsersView.parse(await service.list(alpha.id, query));
    const second = await service.list(alpha.id, { ...query, page: 2 });
    expect(first.total).toBe(1011);
    expect(first.items).toHaveLength(20);
    expect(
      new Set([...first.items, ...second.items].map((user) => `${user.kind}:${user.id}`)).size,
    ).toBe(40);
    const found = await service.list(alpha.id, { ...query, search: 'admin-0@example.test' });
    expect(found.total).toBe(2);
    expect((await service.list(alpha.id, { ...query, search: '%' })).total).toBe(0);
    expect((await service.list(alpha.id, { ...query, role: WebRole.HR })).total).toBe(3);
    expect((await service.list(alpha.id, { ...query, role: TenantUserGroup.WORKER })).total).toBe(
      1000,
    );
    expect((await service.list(beta.id, query)).total).toBe(1);
    expect(JSON.stringify(first)).not.toMatch(/fixture-hash|storage_key|ciphertext|telegram|phone/);
  });
  it('reflects changed roles and credentials on the next read', async () => {
    await alpha.handle.db
      .insert(webUserRoles)
      .values({ userId: firstAdmin, role: WebRole.AUDITOR });
    const result = await service.list(alpha.id, TenantUsersQuery.parse({ role: WebRole.AUDITOR }));
    expect(result.total).toBe(1);
    expect(result.counts.total).toBe(1011);
    await alpha.handle.db.delete(webUserRoles).where(eq(webUserRoles.role, WebRole.AUDITOR));
  });
  it('keeps missing and failed databases distinct from zero and isolates a failing client', async () => {
    const result = await service.counts([alpha.id, beta.id, draftId, brokenId]);
    expect(result).toContainEqual({ tenantId: draftId, status: TenantUserAvailability.NOT_READY });
    expect(result).toContainEqual({
      tenantId: brokenId,
      status: TenantUserAvailability.UNAVAILABLE,
    });
    expect(result.find((row) => row.tenantId === beta.id)?.status).toBe(
      TenantUserAvailability.READY,
    );
    await expect(service.list(draftId, TenantUsersQuery.parse({}))).rejects.toMatchObject({
      code: 'TENANT_DATABASE_MISSING',
    });
    await expect(service.list(randomUUID(), TenantUsersQuery.parse({}))).rejects.toMatchObject({
      code: 'TENANT_NOT_FOUND',
    });
  });
  it('protects directory, counts and avatars with MFA and validates request boundaries', async () => {
    const base = '/control/tenant-users';
    expect((await app.inject({ method: 'GET', url: `${base}/${alpha.id}` })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: `${base}/counts?ids=${alpha.id}` })).statusCode,
    ).toBe(401);
    const auth = vi.spyOn(
      app.get<{ api: { getSession: () => Promise<unknown> } }>(AUTH).api,
      'getSession',
    );
    auth.mockResolvedValue({
      session: { mfaVerified: true },
      user: {
        id: randomUUID(),
        name: 'Viewer',
        email: 'viewer@example.test',
        role: OperatorRole.PLATFORM_VIEWER,
        status: Status.ACTIVE,
        twoFactorEnabled: true,
      },
    });
    expect((await app.inject({ method: 'GET', url: `${base}/${alpha.id}` })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${alpha.id}?page=-1` })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${alpha.id}?role=UNKNOWN` })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `${base}/counts?ids=${Array(21).fill(alpha.id).join(',')}`,
        })
      ).statusCode,
    ).toBe(400);
    auth.mockResolvedValue({
      session: { mfaVerified: false },
      user: { status: Status.ACTIVE, twoFactorEnabled: true },
    });
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${alpha.id}/avatars/${randomUUID()}` }))
        .statusCode,
    ).toBe(403);
    auth.mockRestore();
  });
  it('refuses avatar objects outside the selected tenant and employee prefix', async () => {
    const mediaId = randomUUID();
    const employeeId = randomUUID();
    await alpha.handle.db.insert(mediaObjects).values({
      id: mediaId,
      telegramFileId: mediaId,
      telegramFileUniqueId: mediaId,
      purpose: Purpose.EMPLOYEE_AVATAR,
      storageKey: `tenants/beta/employee-avatars/${employeeId}/${mediaId}.webp`,
    });
    await alpha.handle.db.insert(employees).values({
      id: employeeId,
      fullName: 'Avatar',
      personnelNumber: 'avatar',
      avatarMediaId: mediaId,
    });
    await expect(service.avatar(alpha.id, employeeId)).rejects.toMatchObject({
      code: 'AVATAR_NOT_FOUND',
    });
    await expect(service.avatar(beta.id, employeeId)).rejects.toMatchObject({
      code: 'AVATAR_NOT_FOUND',
    });
  });
});
