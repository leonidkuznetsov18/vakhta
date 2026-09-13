import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backgroundTasks,
  employeePositions,
  employees,
  enqueueBackgroundTask,
  notificationOutbox,
  orgUnits,
  positions,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  telegramAccounts,
} from '@vakhta/db';
import { timerTaskIntent } from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { dispatchTimerTasks } from './timers/tasks.js';
import {
  handleAbsenceCheckinWithin,
  handleAbsenceReturnWithin,
  handleBirthdayGreetingWithin,
} from './timers/events.js';

describe('calendar event timers: birthdays, sick leave, vacations', () => {
  let testDb: TestDatabase;
  let employeeId: string;
  let siteId: string;
  let unitId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE background_tasks, notification_outbox, requests, shift_assignments, schedule_versions, shift_templates, employee_positions, positions, telegram_accounts, employees, org_units, sites CASCADE`,
    );
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'ev', name: 'Events', timezone: 'Europe/Kyiv' })
      .returning();
    siteId = site!.id;
    const [unit] = await testDb.db.insert(orgUnits).values({ siteId, name: 'Unit' }).returning();
    unitId = unit!.id;
    const [position] = await testDb.db
      .insert(positions)
      .values({ code: 'OP', name: 'Operator' })
      .returning();
    const [employee] = await testDb.db
      .insert(employees)
      .values({
        personnelNumber: '7',
        fullName: 'Іванов Іван',
        status: 'ACTIVE',
        locale: 'uk',
        birthDate: '1990-09-14',
      })
      .returning();
    employeeId = employee!.id;
    await testDb.db.insert(employeePositions).values({
      employeeId,
      orgUnitId: unitId,
      positionId: position!.id,
      validFrom: new Date(0),
    });
    await testDb.db.insert(telegramAccounts).values({ employeeId, telegramUserId: 777 });
  });

  it('greets on the birthday, re-plans next year, and only re-plans when fired late', async () => {
    const fireAt = new Date('2026-09-14T06:00:00Z'); // 09:00 Kyiv
    const outcome = await testDb.db.transaction((tx) =>
      handleBirthdayGreetingWithin(tx, { employeeId, fireAt: fireAt.toISOString() }, fireAt),
    );
    expect(outcome).toBe('queued');
    const [row] = await testDb.db.select().from(notificationOutbox);
    expect(row).toMatchObject({ recipientId: employeeId, template: 'BIRTHDAY_GREETING' });
    expect(row?.payload.text).toContain('Іван');
    const next = await testDb.db
      .select({ dedupeKey: backgroundTasks.dedupeKey, dueAt: backgroundTasks.dueAt })
      .from(backgroundTasks);
    expect(next.map((task) => task.dedupeKey)).toEqual([`birthday-greeting.${employeeId}.2027`]);
    expect(next[0]?.dueAt.toISOString()).toBe('2027-09-14T06:00:00.000Z');
    // A run two days late does not greet, but keeps the yearly chain alive.
    const late = await testDb.db.transaction((tx) =>
      handleBirthdayGreetingWithin(
        tx,
        { employeeId, fireAt: fireAt.toISOString() },
        new Date('2026-09-16T10:00:00Z'),
      ),
    );
    expect(late).toBe('stale');
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(1);
  });

  it('asks how the person feels only while the sick leave is approved and covers the day', async () => {
    const [request] = await testDb.db
      .insert(requests)
      .values({
        type: 'SICK',
        employeeId,
        status: 'APPROVED',
        currentStep: 1,
        periodFrom: '2026-09-10',
        periodTo: '2026-09-12',
      })
      .returning();
    const job = {
      requestId: request!.id,
      businessDate: '2026-09-11',
      fireAt: '2026-09-11T07:00:00.000Z',
    };
    const early = await testDb.db.transaction((tx) =>
      handleAbsenceCheckinWithin(tx, job, new Date('2026-09-11T06:00:00Z')),
    );
    expect(early).toBe('stale');
    const sent = await testDb.db.transaction((tx) =>
      handleAbsenceCheckinWithin(tx, job, new Date('2026-09-11T07:05:00Z')),
    );
    expect(sent).toBe('queued');
    const [row] = await testDb.db.select().from(notificationOutbox);
    expect(row?.payload.buttons?.[0]?.map((b) => b.callbackData)).toEqual([
      `well:${request!.id}:GOOD`,
      `well:${request!.id}:SAME`,
      `well:${request!.id}:WORSE`,
    ]);
    const again = await testDb.db.transaction((tx) =>
      handleAbsenceCheckinWithin(tx, job, new Date('2026-09-11T08:00:00Z')),
    );
    expect(again).toBe('duplicate');
    await testDb.db
      .update(requests)
      .set({ status: 'CANCELLED' })
      .where(sql`${requests.id} = ${request!.id}`);
    const cancelled = await testDb.db.transaction((tx) =>
      handleAbsenceCheckinWithin(
        tx,
        { ...job, businessDate: '2026-09-12', fireAt: '2026-09-12T07:00:00.000Z' },
        new Date('2026-09-12T08:00:00Z'),
      ),
    );
    expect(cancelled).toBe('stale');
  });

  it('reminds the plan before a vacation ends and dispatches through the task runner', async () => {
    const [request] = await testDb.db
      .insert(requests)
      .values({
        type: 'VACATION',
        employeeId,
        status: 'APPROVED',
        currentStep: 1,
        periodFrom: '2026-09-01',
        periodTo: '2026-09-07',
      })
      .returning();
    const [template] = await testDb.db
      .insert(shiftTemplates)
      .values({
        siteId,
        code: 'DAY',
        name: 'Day',
        localStart: '08:00',
        localEnd: '20:00',
        isNight: false,
      })
      .returning();
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId,
        orgUnitId: unitId,
        periodMonth: '2026-09',
        versionNo: 1,
        status: 'PUBLISHED',
        createdBy: null,
        publishedAt: new Date('2026-08-30T00:00:00Z'),
      })
      .returning();
    await testDb.db.insert(shiftAssignments).values({
      scheduleVersionId: version!.id,
      employeeId,
      templateId: template!.id,
      businessDate: '2026-09-09',
      planStartAt: new Date('2026-09-09T05:00:00Z'),
      planEndAt: new Date('2026-09-09T17:00:00Z'),
      orgUnitId: unitId,
      kind: 'REGULAR',
    });
    const fireAt = '2026-09-06T15:00:00.000Z';
    await testDb.db.transaction((tx) =>
      enqueueBackgroundTask(
        tx,
        timerTaskIntent({ kind: 'ABSENCE_RETURN', payload: { requestId: request!.id, fireAt } }),
      ),
    );
    await dispatchTimerTasks(testDb.db, { batch: 5 });
    const rows = await testDb.db.select().from(notificationOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientId: employeeId, template: 'ABSENCE_RETURN' });
    expect(rows[0]?.payload.text).toContain('09.09');
    expect(rows[0]?.payload.text).toContain('08:00–20:00');
    // Without a following shift the reminder points to "My plan".
    await testDb.db.delete(shiftAssignments);
    const noShift = await testDb.db.transaction((tx) =>
      handleAbsenceReturnWithin(
        tx,
        { requestId: request!.id, fireAt },
        new Date('2026-09-06T16:00:00Z'),
      ),
    );
    expect(noShift).toBe('duplicate');
  });
});
