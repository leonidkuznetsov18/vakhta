import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ScheduleCommandResult } from '@vakhta/contracts';
import { authUser, eq, webUserRoles } from '@vakhta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { auditLog, desc, orgUnits, sites } from '@vakhta/db';
import { DomainErrorFilter } from './common/domain-error.js';
import { corsOptions } from './config/cors.js';
import { ensureDockerHost } from '../test/docker.js';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import type { Database } from '@vakhta/db';

const PASSWORD = 'e2e-password-123456';
const SYSTEM = { type: 'SYSTEM', id: null, role: 'SYSTEM' } as const;

/**
 * Security/RBAC e2e (ТЗ 13, FR-AUTH-03, FR-REQ-02, T-40): повний застосунок на Fastify з Postgres і Redis
 * у контейнерах. Перевіряє межі доступу між ролями, аудит відмов і те, що чутливі маршрути закриті без сесії.
 */
describe('e2e: межі доступу панелі', () => {
  let testDb: TestDatabase;
  let redis: StartedTestContainer;
  let app: NestFastifyApplication;
  let db: Database;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    ensureDockerHost();
    testDb = await startTestDatabase();
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: testDb.url,
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      AUTH_SECRET: 'e2e-auth-secret-at-least-32-characters-long',
      ACTIVATION_PEPPER: 'e2e-activation-pepper-16',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:5173',
      TELEGRAM_BOT_TOKEN: '',
    });
    // ConfigModule.forRoot читає process.env під час імпорту модуля, тому AppModule імпортується динамічно.
    const { AppModule } = await import('./app.module.js');
    const { AuthService } = await import('./auth/auth.service.js');
    const { DATABASE } = await import('./infra/database.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
      abortOnError: false,
    });
    app.useGlobalFilters(new DomainErrorFilter());
    app.enableCors(corsOptions(['http://localhost:5173']));
    const { registerAuthRoutes } = await import('./auth/auth.routes.js');
    const { AUTH } = await import('./auth/auth.service.js');
    registerAuthRoutes(app.getHttpAdapter().getInstance(), app.get(AUTH));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<Database>(DATABASE);

    const auth = app.get(AuthService);
    for (const [email, role] of [
      ['admin@e2e.test', 'ADMIN'],
      ['hr@e2e.test', 'HR'],
      ['master@e2e.test', 'SHIFT_MASTER'],
      ['nobody@e2e.test', null],
      ['planner@e2e.test', null],
    ] as const) {
      await auth.createUser(
        {
          email,
          name: email,
          password: PASSWORD,
          roles: role ? [{ role, scopeType: 'ENTERPRISE' }] : [],
        },
        SYSTEM,
      );
      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in/email',
        headers: { origin: 'http://localhost:5173' },
        payload: { email, password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers['set-cookie'];
      const raw = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
      cookies.set(email, raw.map((c) => c.split(';')[0]).join('; '));
    }
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await redis?.stop();
    await testDb?.stop();
  });

  const as = (email: string) => ({ cookie: cookies.get(email) ?? '' });

  it('без сесії адмін-маршрути закриті; /health і /metrics відкриті', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/employees' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/admin/shifts' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('vakhta_outbox_pending');
    expect(metrics.body).toContain('http_request_duration_seconds');
  });

  it('користувач без ролей бачить лише профіль; ролі обмежують маршрути (FR-AUTH-03)', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/me', headers: as('nobody@e2e.test') })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/employees', headers: as('nobody@e2e.test') }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/employees', headers: as('hr@e2e.test') }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/users', headers: as('hr@e2e.test') }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/users', headers: as('admin@e2e.test') }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/audit', headers: as('master@e2e.test') }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/audit', headers: as('admin@e2e.test') }))
        .statusCode,
    ).toBe(200);
  });

  it('T-40: медичний документ недоступний майстру, відмова пишеться в аудит; HR отримує 404 без документа', async () => {
    const employee = await app.inject({
      method: 'POST',
      url: '/admin/employees',
      headers: as('hr@e2e.test'),
      payload: { personnelNumber: '77', fullName: 'Тестова Особа' },
    });
    expect(employee.statusCode).toBe(201);
    const denied = await app.inject({
      method: 'GET',
      url: '/admin/requests/a0000000-0000-4000-8000-000000000001/medical/link',
      headers: as('master@e2e.test'),
    });
    expect(denied.statusCode).toBe(403);
    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(1);
    expect(entry?.action).toBe('medical.denied');
    const hr = await app.inject({
      method: 'GET',
      url: '/admin/requests/a0000000-0000-4000-8000-000000000001/medical/link',
      headers: as('hr@e2e.test'),
    });
    expect(hr.statusCode).toBe(404);
  });

  it('the loss report and its download: the master reads it, only an editor downloads it', async () => {
    // Every role that runs a shift can read where the time went…
    const read = await app.inject({
      method: 'GET',
      url: '/admin/reports/losses?from=2026-09-01&to=2026-09-30',
      headers: as('master@e2e.test'),
    });
    expect(read.statusCode).toBe(200);
    const view = read.json() as { bars: unknown[]; lostMinutes: number; explainedShare: number };
    expect(Array.isArray(view.bars)).toBe(true);
    expect(typeof view.lostMinutes).toBe('number');
    // …and the report always says how much of the loss it can explain.
    expect(typeof view.explainedShare).toBe('number');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/admin/reports/losses/export/csv?from=2026-09-01&to=2026-09-30',
      headers: as('master@e2e.test'),
    });
    expect(forbidden.statusCode).toBe(403);

    const csv = await app.inject({
      method: 'GET',
      url: '/admin/reports/losses/export/csv?from=2026-09-01&to=2026-09-30',
      headers: as('admin@e2e.test'),
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    // The download is audited like any other, with what was asked for.
    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(1);
    expect(entry).toMatchObject({
      action: 'report.export',
      objectType: 'report',
      objectId: 'losses',
    });

    const xlsx = await app.inject({
      method: 'GET',
      url: '/admin/reports/losses/export/xlsx?from=2026-09-01&to=2026-09-30',
      headers: as('admin@e2e.test'),
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('creating a schedule version answers with the version itself, and it is then in the list', async () => {
    const [site] = await db
      .insert(sites)
      .values({ code: 'E2E', name: 'E2E', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'E2E unit' })
      .returning();

    const created = await app.inject({
      method: 'POST',
      url: '/admin/schedules',
      headers: as('admin@e2e.test'),
      payload: { siteId: site!.id, orgUnitId: unit!.id, periodMonth: '2026-10' },
    });
    expect(created.statusCode).toBe(201);
    // The panel names the new version in its toast and then selects it, so the body has to carry
    // both: an empty object left "Version {no} created" on screen with nothing created.
    const body = created.json() as { id?: string; versionNo?: number; status?: string };
    expect(typeof body.id).toBe('string');
    expect(body.versionNo).toBe(1);
    expect(body.status).toBe('DRAFT');

    const list = await app.inject({
      method: 'GET',
      url: `/admin/schedules?siteId=${site!.id}&orgUnitId=${unit!.id}&periodMonth=2026-10`,
      headers: as('admin@e2e.test'),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { id: string }[]).map((v) => v.id)).toContain(body.id);

    // Old panels cannot silently overwrite a newer draft without a revision precondition.
    const missingRevision = await app.inject({
      method: 'PUT',
      url: `/admin/schedules/${body.id}/assignments`,
      headers: as('admin@e2e.test'),
      payload: { items: [] },
    });
    expect(missingRevision.statusCode).toBe(400);
    const saved = await app.inject({
      method: 'PUT',
      url: `/admin/schedules/${body.id}/assignments`,
      headers: as('admin@e2e.test'),
      payload: { items: [], expectedRevision: 1 },
    });
    expect(saved.statusCode).toBe(200);
    const stale = await app.inject({
      method: 'PUT',
      url: `/admin/schedules/${body.id}/assignments`,
      headers: as('admin@e2e.test'),
      payload: { items: [], expectedRevision: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
    const missingDeleteRevision = await app.inject({
      method: 'DELETE',
      url: `/admin/schedules/${body.id}`,
      headers: as('admin@e2e.test'),
      payload: {},
    });
    expect(missingDeleteRevision.statusCode).toBe(400);

    // The overview's "Build a schedule" lands on a month that may already hold a draft, and on one
    // that holds nothing at all. Both have to answer with a version — the panel selects it by id,
    // and an answer shaped like the list is what left the page empty with a success message.
    const second = await app.inject({
      method: 'POST',
      url: '/admin/schedules',
      headers: as('admin@e2e.test'),
      payload: { siteId: site!.id, orgUnitId: unit!.id, periodMonth: '2026-10' },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = second.json() as { id?: string; versionNo?: number };
    expect(Array.isArray(second.json())).toBe(false);
    expect(secondBody.versionNo).toBe(2);
    expect(secondBody.id).not.toBe(body.id);

    // A POST that carries the wrong site for the unit is refused, not answered with an empty body:
    // the panel used to send exactly this pair while the directory was still loading.
    const [other] = await db
      .insert(sites)
      .values({ code: 'E2E2', name: 'E2E other', timezone: 'Europe/Kyiv' })
      .returning();
    const mismatched = await app.inject({
      method: 'POST',
      url: '/admin/schedules',
      headers: as('admin@e2e.test'),
      payload: { siteId: other!.id, orgUnitId: unit!.id, periodMonth: '2026-10' },
    });
    expect(mismatched.statusCode).toBe(422);
    expect((mismatched.json() as { code?: string }).code).toBe('ORG_UNIT_SITE_MISMATCH');

    // And a body the command rejects is a 400 with a code, never a 2xx the panel has to interpret.
    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/schedules',
      headers: as('admin@e2e.test'),
      payload: { siteId: site!.id, orgUnitId: unit!.id, periodMonth: 'вересень' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('schedule command HTTP boundary validates, scopes, replays and preserves deleted receipts', async () => {
    const [site] = await db
      .insert(sites)
      .values({ code: 'COMMANDS', name: 'Commands', timezone: 'Europe/Kyiv' })
      .returning();
    if (!site) throw new Error('Site fixture missing');
    const [unit] = await db
      .insert(orgUnits)
      .values({ siteId: site.id, name: 'Commands' })
      .returning();
    const [other] = await db
      .insert(orgUnits)
      .values({ siteId: site.id, name: 'Other' })
      .returning();
    const [planner] = await db
      .select()
      .from(authUser)
      .where(eq(authUser.email, 'planner@e2e.test'));
    if (!unit || !other || !planner) throw new Error('Command fixtures missing');
    await db
      .insert(webUserRoles)
      .values({ userId: planner.id, role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: unit.id });
    const payload = {
      commandId: randomUUID(),
      action: 'CREATE',
      payload: { siteId: site.id, orgUnitId: unit.id, periodMonth: '2026-10' },
    };
    const post = (body: object, email = 'planner@e2e.test') =>
      app.inject({
        method: 'POST',
        url: '/admin/schedules/commands',
        headers: as(email),
        payload: body,
      });
    expect(
      (await app.inject({ method: 'POST', url: '/admin/schedules/commands', payload })).statusCode,
    ).toBe(401);
    expect((await post(payload, 'master@e2e.test')).statusCode).toBe(403);
    expect((await post({ ...payload, commandId: 'invalid' })).statusCode).toBe(400);
    expect(
      (await post({ ...payload, payload: { ...payload.payload, orgUnitId: other.id } })).statusCode,
    ).toBe(403);
    const first = await post(payload);
    expect(first.statusCode).toBe(200);
    const result = ScheduleCommandResult.parse(first.json());
    if (result.kind !== 'VERSION') throw new Error('Expected created version');
    expect((await post(payload)).json()).toEqual(result);
    expect((await post(payload, 'admin@e2e.test')).statusCode).toBe(409);
    expect(
      (
        await post({
          commandId: randomUUID(),
          action: 'SAVE',
          versionId: result.version.id,
          payload: { items: [] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post({
          commandId: randomUUID(),
          action: 'PUBLISH',
          versionId: result.version.id,
          expectedRevision: result.version.revision,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const remove = {
      commandId: randomUUID(),
      action: 'DELETE',
      versionId: result.version.id,
      expectedRevision: result.version.revision,
    };
    const deleted = await post(remove);
    expect(deleted.statusCode).toBe(200);
    expect(ScheduleCommandResult.parse(deleted.json())).toEqual({
      commandId: remove.commandId,
      kind: 'DELETED',
      versionId: result.version.id,
    });
    expect((await post(remove)).json()).toEqual(deleted.json());
    await db.delete(webUserRoles).where(eq(webUserRoles.userId, planner.id));
    await db
      .insert(webUserRoles)
      .values({ userId: planner.id, role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: other.id });
    expect((await post(remove)).statusCode).toBe(403);
  });

  it('невалідне тіло відхиляється 400 до бізнес-логіки; чужий origin не отримує CORS', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/admin/employees',
      headers: as('hr@e2e.test'),
      payload: { personnelNumber: '', fullName: 'x' },
    });
    expect(bad.statusCode).toBe(400);
    const foreign = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});
