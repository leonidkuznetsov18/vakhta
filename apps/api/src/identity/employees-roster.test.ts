import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { employees } from '@vakhta/db';
import { EmployeesPage, ListEmployeesPageQuery } from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { EventStore } from '../events/event-store.js';
import { AuditLog } from '../events/audit-log.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmployeesService } from './employees.service.js';
import { AdminEmployeesController } from './admin-employees.controller.js';

describe('employee directory pagination', () => {
  let database: TestDatabase;
  let service: EmployeesService;
  beforeAll(async () => {
    database = await startTestDatabase();
    service = new EmployeesService(
      database.db,
      new EventStore(),
      new AuditLog(),
      new NotificationsService(),
    );
  }, 180_000);
  afterAll(async () => {
    await database?.stop();
  });

  it('returns an empty directory with an accurate total', async () => {
    expect(await service.listPage({ limit: 200 })).toEqual({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });
  it('reads all 205 employees without duplicates and keeps the legacy limit', async () => {
    await database.db.insert(employees).values(
      Array.from({ length: 205 }, (_, index) => ({
        personnelNumber: `ROSTER-${index}`,
        fullName: `Roster worker ${index + 1}`,
      })),
    );
    const first = EmployeesPage.parse(await service.listPage({ limit: 200 }));
    expect(first.items).toHaveLength(200);
    expect(first.total).toBe(205);
    expect(first.nextCursor).toBe(first.items.at(-1)?.id);
    if (!first.nextCursor) throw new Error('Missing next cursor');
    const last = EmployeesPage.parse(
      await service.listPage({ limit: 200, after: first.nextCursor }),
    );
    expect(last.items).toHaveLength(5);
    expect(last.total).toBe(205);
    expect(last.nextCursor).toBeNull();
    const ids = [...first.items, ...last.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(205);
    expect(ids).toEqual([...ids].sort());
    expect(await service.list()).toHaveLength(200);
  });
  it('validates page sizes and UUID cursors at the HTTP boundary', () => {
    expect(ListEmployeesPageQuery.parse({})).toEqual({ limit: 200 });
    expect(ListEmployeesPageQuery.parse({ limit: '50' })).toEqual({ limit: 50 });
    for (const query of [{ limit: 201 }, { limit: 0 }, { limit: 1.5 }, { after: 'invalid' }]) {
      expect(ListEmployeesPageQuery.safeParse(query).success).toBe(false);
    }
  });
  it('retains the existing explicit directory read roles', () => {
    const roles: unknown = Reflect.getMetadata(
      'vakhta:roles',
      AdminEmployeesController.prototype.listPage,
    );
    expect(roles).toEqual(['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER']);
  });
});
