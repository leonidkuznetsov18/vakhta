import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backgroundTasks,
  checklistDefinitions,
  domainEvents,
  employees,
  eq,
  handoverRecords,
  notificationOutbox,
  orgUnits,
  responsibilityZones,
  shiftSessions,
  sites,
  sql,
} from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { handleCleaningReminder, handleHandoverTimeout } from './timers/handover-timers.js';

describe('worker: тайм-аут приймання і нагадування про прибирання (FR-HND-06, FR-CLN-01)', () => {
  let testDb: TestDatabase;
  let employeeId: string;
  let zoneId: string;
  let sessionId: string;
  let definitionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE notification_outbox, handover_records, checklist_definitions, shift_sessions, responsibility_zones, employees, org_units, sites CASCADE`,
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
    zoneId = zone!.id;
    const [emp] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Иванов Иван' })
      .returning();
    employeeId = emp!.id;
    const [session] = await testDb.db
      .insert(shiftSessions)
      .values({
        employeeId,
        businessDate: '2026-10-01',
        state: 'WORKING',
        version: 5,
        startedAt: new Date(Date.now() - 3_600_000),
        zoneId,
        planEndAt: new Date(Date.now() + 30 * 60_000),
      })
      .returning();
    sessionId = session!.id;
    const [def] = await testDb.db
      .insert(checklistDefinitions)
      .values({ version: 1, items: [{ key: 'FLOOR', label: 'Пол' }] })
      .returning();
    definitionId = def!.id;
  });

  it('прострочену приймання ескалює майстру один раз і сповіщає здавача', async () => {
    const [record] = await testDb.db
      .insert(handoverRecords)
      .values({
        shiftSessionId: sessionId,
        zoneId,
        submittedBy: employeeId,
        checklistDefinitionId: definitionId,
        status: 'SUBMITTED',
        submittedAt: new Date(Date.now() - 2 * 3_600_000),
        acceptDeadlineAt: new Date(Date.now() - 60_000),
      })
      .returning();
    const job = { handoverId: record!.id, fireAt: record!.acceptDeadlineAt!.toISOString() };
    expect(await handleHandoverTimeout(testDb.db, job)).toBe('queued');
    expect(await handleHandoverTimeout(testDb.db, job)).toBe('duplicate');
    const [after] = await testDb.db
      .select()
      .from(handoverRecords)
      .where(eq(handoverRecords.id, record!.id));
    expect(after?.escalatedToMasterAt).not.toBeNull();
    expect(after?.status).toBe('SUBMITTED');
    const notices = await testDb.db.select().from(notificationOutbox);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.payload.text).toContain('Линия A');
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(events.map((e) => e.type)).toContain('HANDOVER_TIMEOUT');
  });

  it('reschedules a legacy durable timeout with the migrated review deadline', async () => {
    const end = new Date('2026-09-10T17:00:00.000Z');
    const old = new Date('2026-09-10T17:30:00.000Z');
    const deadline = new Date('2026-09-10T19:00:00.000Z');
    await testDb.db
      .update(shiftSessions)
      .set({ planEndAt: end })
      .where(eq(shiftSessions.id, sessionId));
    const [record] = await testDb.db
      .insert(handoverRecords)
      .values({
        shiftSessionId: sessionId,
        zoneId,
        submittedBy: employeeId,
        checklistDefinitionId: definitionId,
        status: 'SUBMITTED',
        submittedAt: end,
        acceptDeadlineAt: old,
      })
      .returning();
    if (!record) throw new Error('Missing fixture');
    await testDb.db.insert(backgroundTasks).values({
      kind: 'HANDOVER_TIMEOUT',
      dedupeKey: `handover-timeout.${record.id}`,
      payload: { handoverId: record.id, fireAt: old.toISOString() },
      dueAt: old,
      availableAt: old,
    });
    const migration = await readFile(
      new URL('../../../packages/db/drizzle/0030_handover_review_deadline.sql', import.meta.url),
      'utf8',
    );
    await testDb.db.transaction(async (tx) => {
      for (const statement of migration.split('--> statement-breakpoint'))
        await tx.execute(sql.raw(statement));
    });
    const [task] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.dedupeKey, `handover-timeout.${record.id}`));
    expect(task?.dueAt).toEqual(deadline);
    expect(task?.payload.fireAt).toBe(deadline.toISOString());
    expect(task?.status).toBe('PENDING');
    await expect(
      testDb.db
        .update(backgroundTasks)
        .set({ dueAt: old })
        .where(eq(backgroundTasks.dedupeKey, `handover-timeout.${record.id}`)),
    ).rejects.toThrow();

    const job = { handoverId: record.id, fireAt: String(task?.payload.fireAt) };
    expect(await handleHandoverTimeout(testDb.db, job, new Date(deadline.getTime() - 1))).toBe(
      'stale',
    );
    expect(await handleHandoverTimeout(testDb.db, job, deadline)).toBe('queued');
    expect(await handleHandoverTimeout(testDb.db, job, deadline)).toBe('duplicate');
  });

  it('дедлайн ще не настав або зону вже прийнято: нічого не робить', async () => {
    const [fresh] = await testDb.db
      .insert(handoverRecords)
      .values({
        shiftSessionId: sessionId,
        zoneId,
        submittedBy: employeeId,
        checklistDefinitionId: definitionId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        acceptDeadlineAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    expect(
      await handleHandoverTimeout(testDb.db, {
        handoverId: fresh!.id,
        fireAt: new Date().toISOString(),
      }),
    ).toBe('stale');
    await testDb.db
      .update(handoverRecords)
      .set({ status: 'ACCEPTED', acceptDeadlineAt: new Date(Date.now() - 1) })
      .where(eq(handoverRecords.id, fresh!.id));
    expect(
      await handleHandoverTimeout(testDb.db, {
        handoverId: fresh!.id,
        fireAt: new Date().toISOString(),
      }),
    ).toBe('stale');
  });

  it('нагадування про прибирання з кнопкою у стані WORKING; після початку прибирання мовчить', async () => {
    const job = { sessionId, fireAt: new Date().toISOString() };
    expect(await handleCleaningReminder(testDb.db, job)).toBe('queued');
    expect(await handleCleaningReminder(testDb.db, job)).toBe('duplicate');
    const [notice] = await testDb.db.select().from(notificationOutbox);
    expect(notice?.payload.buttons?.[0]?.[0]?.callbackData).toBe('sh:START_CLEANING:5');
    await testDb.db
      .update(shiftSessions)
      .set({ state: 'CLEANING' })
      .where(eq(shiftSessions.id, sessionId));
    await testDb.db.execute(sql`TRUNCATE notification_outbox`);
    expect(await handleCleaningReminder(testDb.db, job)).toBe('stale');
  });
});
