import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  employeePositions,
  employees,
  orgUnits,
  positions,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  teams,
} from '@vakhta/db';
import type { RoleGrant } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import type { WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import type { ActivationService } from './activation.service.js';
import { AdminEmployeesController } from './admin-employees.controller.js';
import { AdminPositionsController } from './admin-positions.controller.js';
import { EmployeesService } from './employees.service.js';
import { PositionsService } from './positions.service.js';

/**
 * Spec 005 US1 (AC-001, #66): the employee directory and every action by identifier apply the
 * grant scope, not only the role. Two sites, three units (A and B on site 1, C on site 2), one
 * employee per unit, one employee without an assignment, and a unit B employee borrowed into A's calendar.
 */
describe('employee directory access scope (spec 005 US1)', () => {
  let testDb: TestDatabase;
  let service: EmployeesService;
  let directory: AdminEmployeesController;
  let assignments: AdminPositionsController;
  const unit = {} as Record<'A' | 'B' | 'C', string>;
  const person = {} as Record<'A' | 'B' | 'C' | 'unassigned' | 'borrowed', string>;
  let site1 = '';
  let positionId = '';

  const user = (...grants: RoleGrant[]): WebUser => ({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'scope@example.test',
    name: 'Scope',
    twoFactorEnabled: false,
    grants,
  });
  const master = (id: string) => user({ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: id });
  const unitHr = (id: string) => user({ role: 'HR', scopeType: 'ORG_UNIT', scopeId: id });
  const head = (id: string) => user({ role: 'PRODUCTION_HEAD', scopeType: 'SITE', scopeId: id });
  const enterpriseHr = user({ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null });

  const forbidden = async (call: Promise<unknown>) => {
    const error = await call.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'OUT_OF_SCOPE', status: 403 });
  };
  const namesOf = (views: readonly { fullName: string }[]) => views.map((v) => v.fullName).sort();

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db;
    await db.execute(sql`TRUNCATE sites, employees CASCADE`);
    const events = new EventStore();
    const audit = new AuditLog();
    service = new EmployeesService(db, events, audit, new NotificationsService());
    const positionsService = new PositionsService(
      db,
      events,
      audit,
      service,
      new OrgService(db, events, audit),
    );
    directory = new AdminEmployeesController(service, {} as ActivationService, positionsService);
    assignments = new AdminPositionsController(positionsService, service);

    const [s1, s2] = await db
      .insert(sites)
      .values([
        { code: 's1', name: 'Plant 1', timezone: 'Europe/Kyiv' },
        { code: 's2', name: 'Plant 2', timezone: 'Europe/Kyiv' },
      ])
      .returning();
    site1 = s1!.id;
    const [position] = await db
      .insert(positions)
      .values({ code: 'OP', name: 'Operator' })
      .returning();
    positionId = position!.id;
    for (const [key, siteId] of [
      ['A', s1!.id],
      ['B', s1!.id],
      ['C', s2!.id],
    ] as const) {
      const [row] = await db
        .insert(orgUnits)
        .values({ siteId, name: `Unit ${key}` })
        .returning();
      unit[key] = row!.id;
    }
    const people = await db
      .insert(employees)
      .values(
        ['A', 'B', 'C', 'unassigned', 'borrowed'].map((key) => ({
          personnelNumber: `SCOPE-${key}`,
          fullName: `Worker ${key}`,
          phone: '+380671234567',
          email: `${key.toLowerCase()}@example.test`,
          birthDate: '1990-03-14',
        })),
      )
      .returning();
    for (const row of people) {
      person[row.fullName.replace('Worker ', '') as keyof typeof person] = row.id;
    }
    const placed = [
      [person.A, unit.A],
      [person.B, unit.B],
      [person.C, unit.C],
      [person.borrowed, unit.B],
    ] as const;
    await db.insert(employeePositions).values(
      placed.map(([employeeId, orgUnitId]) => ({
        employeeId,
        orgUnitId,
        positionId,
        validFrom: new Date('2026-01-01T00:00:00Z'),
      })),
    );
    const [template] = await db
      .insert(shiftTemplates)
      .values({ siteId: site1, code: 'DAY', name: 'Day', localStart: '08:00', localEnd: '20:00' })
      .returning();
    const [version] = await db
      .insert(scheduleVersions)
      .values({ siteId: site1, orgUnitId: unit.A, periodMonth: '2026-09', versionNo: 1 })
      .returning();
    await db.insert(shiftAssignments).values({
      scheduleVersionId: version!.id,
      employeeId: person.borrowed,
      templateId: template!.id,
      businessDate: '2026-09-14',
      planStartAt: new Date('2026-09-14T05:00:00Z'),
      planEndAt: new Date('2026-09-14T17:00:00Z'),
      orgUnitId: unit.A,
    });
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it('lists only employees whose open assignment is in scope, with a scoped total', async () => {
    const page = await directory.listPage({ limit: 200 }, master(unit.A));
    expect(namesOf(page.items)).toEqual(['Worker A']);
    expect(page.total).toBe(1);
    expect(namesOf(await directory.list(master(unit.A)))).toEqual(['Worker A']);

    const site = await directory.listPage({ limit: 200 }, head(site1));
    expect(namesOf(site.items)).toEqual(['Worker A', 'Worker B', 'Worker borrowed']);
    expect(site.total).toBe(3);

    const all = await directory.listPage({ limit: 200 }, enterpriseHr);
    expect(all.total).toBe(5);
    expect(namesOf(all.items)).toContain('Worker unassigned');
  });

  it('pages a scoped directory without leaking other units through the cursor', async () => {
    const first = await directory.listPage({ limit: 1 }, head(site1));
    expect(first.items).toHaveLength(1);
    expect(first.total).toBe(3);
    const seen = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const next = await directory.listPage({ limit: 1, after: cursor }, head(site1));
      seen.push(...next.items);
      cursor = next.nextCursor;
    }
    expect(namesOf(seen)).toEqual(['Worker A', 'Worker B', 'Worker borrowed']);
  });

  it('forbids direct reads outside the scope, including missing and unassigned identifiers', async () => {
    expect((await directory.get(person.A, master(unit.A))).fullName).toBe('Worker A');
    await forbidden(directory.get(person.B, master(unit.A)));
    await forbidden(directory.get(person.C, head(site1)));
    await forbidden(directory.get(person.unassigned, head(site1)));
    await forbidden(directory.get('00000000-0000-4000-8000-000000000000', master(unit.A)));
    expect((await directory.get(person.unassigned, enterpriseHr)).fullName).toBe(
      'Worker unassigned',
    );
    await forbidden(assignments.history(person.B, master(unit.A)));
    expect(await assignments.history(person.A, master(unit.A))).toHaveLength(1);
  });

  it('does not expose a borrowed employee profile outside the current assignment scope', async () => {
    await forbidden(directory.get(person.borrowed, master(unit.A)));
    await forbidden(directory.get(person.borrowed, master(unit.C)));
    await forbidden(assignments.history(person.borrowed, master(unit.A)));
  });

  it('keeps writes and messages inside the writer’s scope', async () => {
    const hr = unitHr(unit.A);
    await forbidden(directory.update(person.B, { fullName: 'Changed B' }, hr));
    expect(
      (
        await directory.update(
          person.A,
          {
            fullName: 'Worker A',
            expectedVersion: (await service.getById(person.A))?.updatedAt.toISOString(),
          },
          hr,
        )
      ).fullName,
    ).toBe('Worker A');
    await forbidden(directory.changeStatus(person.B, { status: 'BLOCKED', reason: 'test' }, hr));
    await forbidden(directory.remove(person.B, { reason: 'out of scope' }, hr));
    await forbidden(directory.issueCode(person.B, hr));
    await forbidden(directory.issueCodes({ employeeIds: [person.A, person.B] }, hr));
    await forbidden(directory.relink(person.B, { telegramUserId: 42, reason: 'test' }, hr));
    await forbidden(directory.message(person.B, { text: 'Hello' }, master(unit.A)));
    await forbidden(directory.bulkDelete({ ids: [person.A, person.B], reason: 'mixed' }, hr));
    expect((await service.getById(person.A))?.status).toBe('ACTIVE');
    expect((await service.getById(person.B))?.fullName).toBe('Worker B');
  });

  it('creates and transfers only into units of the writer’s scope; import needs enterprise scope', async () => {
    const hr = unitHr(unit.A);
    const card = {
      personnelNumber: 'SCOPE-new',
      fullName: 'New worker',
      status: 'ACTIVE' as const,
    };
    await forbidden(directory.create(card, hr));
    await forbidden(directory.create({ ...card, orgUnitId: unit.B, positionId }, hr));
    const created = await directory.create({ ...card, orgUnitId: unit.A, positionId }, hr);
    expect(created.currentPosition?.orgUnitId).toBe(unit.A);
    await forbidden(assignments.assign(person.A, { orgUnitId: unit.B, positionId }, hr));
    await forbidden(
      directory.importMany(
        { items: [{ personnelNumber: 'SCOPE-csv', fullName: 'Csv worker' }] },
        hr,
      ),
    );
    expect(
      (
        await directory.importMany(
          { items: [{ personnelNumber: 'SCOPE-csv', fullName: 'Csv worker' }] },
          enterpriseHr,
        )
      ).created,
    ).toBe(1);
  });

  it('scopes planners and multi-grant users by the roles of each endpoint', async () => {
    const planner = user({ role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: unit.B });
    expect(namesOf((await directory.listPage({ limit: 200 }, planner)).items)).toEqual([
      'Worker B',
      'Worker borrowed',
    ]);
    await forbidden(directory.get(person.A, planner));

    // Enterprise-wide reading as a master does not widen HR writes granted on one unit.
    const mixed = user(
      { role: 'SHIFT_MASTER', scopeType: 'ENTERPRISE', scopeId: null },
      { role: 'HR', scopeType: 'ORG_UNIT', scopeId: unit.A },
    );
    expect((await directory.listPage({ limit: 200 }, mixed)).total).toBeGreaterThanOrEqual(5);
    await forbidden(directory.update(person.B, { fullName: 'Changed B' }, mixed));
    await forbidden(
      directory.importMany(
        { items: [{ personnelNumber: 'SCOPE-x', fullName: 'X worker' }] },
        mixed,
      ),
    );
  });

  it('keeps a team-scoped writer inside their team on create and transfer', async () => {
    const [teamOne, teamTwo] = await testDb.db
      .insert(teams)
      .values([
        { orgUnitId: unit.A, name: 'Team 1' },
        { orgUnitId: unit.A, name: 'Team 2' },
      ])
      .returning();
    const teamHr = user({ role: 'HR', scopeType: 'TEAM', scopeId: teamOne!.id });
    const card = {
      personnelNumber: 'SCOPE-team',
      fullName: 'Team worker',
      status: 'ACTIVE' as const,
    };
    await forbidden(directory.create({ ...card, orgUnitId: unit.A, positionId }, teamHr));
    await forbidden(
      directory.create({ ...card, orgUnitId: unit.A, positionId, teamId: teamTwo!.id }, teamHr),
    );
    const created = await directory.create(
      { ...card, orgUnitId: unit.A, positionId, teamId: teamOne!.id },
      teamHr,
    );
    expect(created.currentPosition?.teamId).toBe(teamOne!.id);
    await forbidden(
      assignments.assign(
        created.id,
        { orgUnitId: unit.A, positionId, teamId: teamTwo!.id },
        teamHr,
      ),
    );
    await forbidden(assignments.assign(created.id, { orgUnitId: unit.A, positionId }, teamHr));
  });
});
