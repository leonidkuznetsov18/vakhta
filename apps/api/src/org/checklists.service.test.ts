import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checklistDefinitionPositions,
  checklistDefinitions,
  employees,
  handoverRecords,
  orgUnits,
  positions,
  responsibilityZones,
  shiftSessions,
  sites,
  sql,
} from '@vakhta/db';
import type { Actor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ChecklistsService } from './checklists.service.js';
import { OrgService } from './org.service.js';

const admin: Actor = {
  type: 'WEB_USER',
  id: '00000000-0000-0000-0000-000000000001',
  role: 'ADMIN',
};

describe('checklists the admin builds (spec 5.6, FR-CLN-03)', () => {
  let testDb: TestDatabase;
  let service: ChecklistsService;
  let positionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE handover_records, shift_sessions, checklist_definition_positions, checklist_definitions, responsibility_zones, employees, positions, org_units, sites CASCADE`,
    );
    const events = new EventStore();
    const audit = new AuditLog();
    service = new ChecklistsService(
      testDb.db,
      events,
      audit,
      new OrgService(testDb.db, events, audit),
    );
    const [position] = await testDb.db
      .insert(positions)
      .values({ code: 'OPERATOR', name: 'Оператор' })
      .returning();
    positionId = position!.id;
  });

  const items = [
    { label: 'Линия остановлена', kind: 'CHECK' as const },
    { label: 'Сообщение смене', kind: 'NOTE' as const },
    { label: 'Фото линии', kind: 'PHOTO' as const },
  ];

  it('refuses a checklist without a position: the position is the key', async () => {
    await expect(
      service.create(
        { name: 'x', positionIds: ['00000000-0000-4000-8000-000000000009'], items },
        admin,
      ),
    ).rejects.toMatchObject({ code: 'POSITION_NOT_FOUND' });
  });

  it('creates a checklist with generated keys and lists the latest version per family', async () => {
    const created = await service.create(
      { name: 'Оператор линии', positionIds: [positionId], zoneType: 'AREA', items },
      admin,
    );
    expect(created).toMatchObject({
      name: 'Оператор линии',
      version: 1,
      positions: [{ id: positionId, name: 'Оператор' }],
      zoneType: 'AREA',
      isActive: true,
      handovers: 0,
    });
    expect(created.items.map((i) => i.key)).toEqual(['ITEM_01', 'ITEM_02', 'ITEM_03']);
    await service.create({ name: 'Общий', positionIds: [positionId], items: [items[2]!] }, admin);
    const list = await service.list();
    expect(list.map((c) => c.name)).toEqual(['Общий', 'Оператор линии']);
    expect(list.find((c) => c.name === 'Общий')).toMatchObject({
      positions: [{ id: positionId, name: 'Оператор' }],
      zoneType: null,
    });
  });

  it('editing writes a new version, retires the previous one and keeps the family', async () => {
    const v1 = await service.create({ name: 'Оператор', positionIds: [positionId], items }, admin);
    const v2 = await service.update(
      v1.id,
      { name: 'Оператор (обновлён)', positionIds: [positionId], items: [items[0]!, items[2]!] },
      admin,
    );
    expect(v2).toMatchObject({ familyId: v1.familyId, version: 2, isActive: true });
    expect(v2.items.map((i) => i.label)).toEqual(['Линия остановлена', 'Фото линии']);
    const versions = await service.versions(v1.familyId);
    expect(versions.map((v) => [v.version, v.isActive])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect((await service.list()).map((c) => c.version)).toEqual([2]);
    // the retired version is read-only
    await expect(
      service.update(v1.id, { name: 'x', positionIds: [positionId], items }, admin),
    ).rejects.toMatchObject({
      code: 'CHECKLIST_VERSION_STALE',
    });
  });

  it('status toggles on the current version; a disabled checklist stays disabled after an edit', async () => {
    const created = await service.create(
      { name: 'Оператор', positionIds: [positionId], items },
      admin,
    );
    const disabled = await service.setStatus(
      created.id,
      { isActive: false, reason: 'Пилот завершён' },
      admin,
    );
    expect(disabled.isActive).toBe(false);
    const edited = await service.update(
      created.id,
      { name: 'Оператор 2', positionIds: [positionId], items },
      admin,
    );
    expect(edited.isActive).toBe(false);
    expect((await service.setStatus(edited.id, { isActive: true }, admin)).isActive).toBe(true);
  });

  it('deletes every version while unused and refuses once a handover refers to it', async () => {
    const free = await service.create(
      { name: 'Свободный', positionIds: [positionId], items },
      admin,
    );
    await service.update(free.id, { name: 'Свободный 2', positionIds: [positionId], items }, admin);
    const current = (await service.list()).find((c) => c.familyId === free.familyId)!;
    await service.delete(current.id, 'Ошибочно создан', admin);
    expect(await testDb.db.select().from(checklistDefinitions)).toHaveLength(0);

    const used = await service.create(
      { name: 'Используемый', positionIds: [positionId], items },
      admin,
    );
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
    const [zone] = await testDb.db
      .insert(responsibilityZones)
      .values({ siteId: site!.id, orgUnitId: unit!.id, code: 'A', name: 'Линия A' })
      .returning();
    const [employee] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '0001', fullName: 'Иванов Иван' })
      .returning();
    const [session] = await testDb.db
      .insert(shiftSessions)
      .values({ employeeId: employee!.id, businessDate: '2026-09-06', zoneId: zone!.id })
      .returning();
    await testDb.db.insert(handoverRecords).values({
      shiftSessionId: session!.id,
      zoneId: zone!.id,
      submittedBy: employee!.id,
      checklistDefinitionId: used.id,
    });
    await expect(service.delete(used.id, 'Попытка', admin)).rejects.toMatchObject({
      code: 'CHECKLIST_IN_USE',
    });
    expect((await service.list()).find((c) => c.id === used.id)?.handovers).toBe(1);
  });

  it('a position has one checklist: attaching another replaces it, detaching may leave none', async () => {
    const [fitter] = await testDb.db
      .insert(positions)
      .values({ code: 'FITTER', name: 'Наладчик' })
      .returning();
    const photos = await service.create(
      { name: 'Фото оборудования', positionIds: [positionId], items },
      admin,
    );
    const cleaning = await service.create(
      { name: 'Уборка и передача зоны', positionIds: [fitter!.id], items },
      admin,
    );
    // the operator position moves from "Фото" to "Уборка"
    const moved = await service.addPosition(cleaning.id, positionId, admin);
    expect(moved.positions.map((p) => p.name)).toEqual(['Наладчик', 'Оператор']);
    const list = await service.list();
    expect(list.find((c) => c.id === photos.id)?.positions).toEqual([]);
    // a new version keeps the bindings and the retired version gives them up
    const v2 = await service.update(
      cleaning.id,
      { name: 'Уборка v2', positionIds: [positionId, fitter!.id], items },
      admin,
    );
    expect(v2.positions).toHaveLength(2);
    expect(await testDb.db.select().from(checklistDefinitionPositions)).toHaveLength(2);
    // the checklist that lost its last position is disabled, and cannot be enabled without one
    expect(list.find((c) => c.id === photos.id)?.isActive).toBe(false);
    await expect(service.setStatus(photos.id, { isActive: true }, admin)).rejects.toMatchObject({
      code: 'CHECKLIST_NO_POSITIONS',
    });
    // detaching the last position disables the checklist as well
    const bare = await service.removePosition(v2.id, positionId, admin);
    const alone = await service.removePosition(bare.id, fitter!.id, admin);
    expect(alone.positions).toEqual([]);
    expect(alone.isActive).toBe(false);
  });
});
