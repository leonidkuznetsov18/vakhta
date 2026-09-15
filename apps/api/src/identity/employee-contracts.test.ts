import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { type RoleGrant } from '@vakhta/domain';
import { AdminEmployeesController } from './admin-employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { PositionsService } from './positions.service.js';
import { ActivationService } from './activation.service.js';
import { AuthService, type SessionUser } from '../auth/auth.service.js';
import { RolesService } from '../auth/roles.service.js';
import { DomainErrorFilter } from '../common/domain-error.js';

const user = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'QA',
  email: 'qa@example.test',
  twoFactorEnabled: true,
};
const sessionUser = vi.fn<() => Promise<SessionUser | null>>();
const grantsOf = vi.fn<() => Promise<RoleGrant[]>>();
const listPage = vi.fn();
const importMany = vi.fn();
const restrictView = vi.fn((row: unknown) => row);
let app: NestFastifyApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [AdminEmployeesController],
    providers: [
      { provide: EmployeesService, useValue: { listPage, importMany, restrictView } },
      { provide: PositionsService, useValue: {} },
      { provide: ActivationService, useValue: {} },
      { provide: AuthService, useValue: { sessionUser } },
      { provide: RolesService, useValue: { grantsOf } },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  app.useGlobalFilters(new DomainErrorFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  sessionUser.mockResolvedValue(user);
  grantsOf.mockResolvedValue([{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }]);
  listPage.mockResolvedValue({ items: [], total: 0, nextCursor: null });
  importMany.mockResolvedValue({ created: 1, skipped: [] });
});

describe('Nest/Zod employee HTTP contract', () => {
  it('preserves query coercion/defaults and a validated paginated result', async () => {
    const result = await app.inject({ method: 'GET', url: '/admin/employees/page?limit=12' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ items: [], total: 0, nextCursor: null });
    expect(listPage).toHaveBeenCalledWith({ limit: 12 }, expect.objectContaining({ all: true }));
    await app.inject({ method: 'GET', url: '/admin/employees/page' });
    expect(listPage).toHaveBeenLastCalledWith({ limit: 200 }, expect.anything());
  });
  it.each(['/admin/employees/page?limit=201', '/admin/employees/page?after=bad'])(
    'keeps the 400 validation envelope for %s',
    async (url) => {
      const result = await app.inject({ method: 'GET', url });
      expect(result.statusCode).toBe(400);
      expect(result.json()).toMatchObject({
        message: 'Некоректний запит',
        issues: [
          expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
        ],
      });
      expect(listPage).not.toHaveBeenCalled();
    },
  );
  it('retains the real authentication and role guards', async () => {
    sessionUser.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'GET', url: '/admin/employees/page' })).statusCode).toBe(
      401,
    );
    grantsOf.mockResolvedValueOnce([{ role: 'AUDITOR', scopeType: 'ENTERPRISE', scopeId: null }]);
    expect((await app.inject({ method: 'GET', url: '/admin/employees/page' })).statusCode).toBe(
      403,
    );
    expect(listPage).not.toHaveBeenCalled();
  });
  it('retains 201, normalized input and import scope restrictions', async () => {
    const payload = { items: [{ personnelNumber: ' 12 ', fullName: ' Test employee ' }] };
    const result = await app.inject({ method: 'POST', url: '/admin/employees/import', payload });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual({ created: 1, skipped: [] });
    expect(importMany).toHaveBeenCalledWith(
      { items: [expect.objectContaining({ personnelNumber: '12', fullName: 'Test employee' })] },
      expect.objectContaining({ id: user.id }),
    );
    grantsOf.mockResolvedValueOnce([{ role: 'HR', scopeType: 'SITE', scopeId: user.id }]);
    const denied = await app.inject({ method: 'POST', url: '/admin/employees/import', payload });
    expect(denied.statusCode).toBe(403);
    expect(importMany).toHaveBeenCalledTimes(1);
  });
  it('rejects an invalid batch before calling the service', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/admin/employees/import',
      payload: { items: [] },
    });
    expect(result.statusCode).toBe(400);
    expect(importMany).not.toHaveBeenCalled();
  });
  it('refuses an invalid service response at the HTTP boundary', async () => {
    listPage.mockResolvedValueOnce({ items: [], total: -1, nextCursor: null });
    expect((await app.inject({ method: 'GET', url: '/admin/employees/page' })).statusCode).toBe(
      500,
    );
  });
  it('derives unique query parameters and success schemas from actual controller metadata', () => {
    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setOpenAPIVersion('3.1.0').setTitle('Test').setVersion('1').build(),
      ),
    );
    const page = document.paths['/admin/employees/page']?.get;
    expect(page?.operationId).toBe('listEmployeePage');
    expect(page?.parameters).toHaveLength(2);
    expect(page?.responses['200']).toBeDefined();
    expect(document.paths['/admin/employees/import']?.post?.responses['201']).toBeDefined();
  });
});
