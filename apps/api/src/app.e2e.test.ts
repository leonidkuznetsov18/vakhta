import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { auditLog, desc } from '@vakhta/db';
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

  it('вивантаження звіту доступне бухгалтерії й фіксується в аудиті з версією даних (FR-WEB-05)', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/admin/reports/hours/export/csv?from=2026-09-01&to=2026-09-30',
      headers: as('master@e2e.test'),
    });
    expect(forbidden.statusCode).toBe(403);
    const csv = await app.inject({
      method: 'GET',
      url: '/admin/reports/hours/export/csv?from=2026-09-01&to=2026-09-30',
      headers: as('admin@e2e.test'),
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Сотрудник');
    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(1);
    expect(entry).toMatchObject({
      action: 'report.export',
      objectType: 'report',
      objectId: 'hours',
    });
    expect((entry?.after as { dataVersion?: string })?.dataVersion).toHaveLength(12);
    const xlsx = await app.inject({
      method: 'GET',
      url: '/admin/reports/bonus/export/xlsx?from=2026-09-01&to=2026-09-30',
      headers: as('admin@e2e.test'),
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
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
