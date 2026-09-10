import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  employees,
  notificationOutbox,
  orgUnits,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
  telegramAccounts,
} from '@vakhta/db';
import type { RequestStatus } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { handleShiftReminder } from './timers/reminders.js';
import { relayOnce, SendError } from './outbox/relay.js';
import { WorkerEnvSchema } from './env.js';

const start = new Date('2026-10-01T03:30:00Z'); // 06:30 at the site.
const due = new Date('2026-10-01T03:00:00Z');
const early = new Date('2026-10-01T01:30:00Z');

describe('shift reminder delivery policy', () => {
  let testDb: TestDatabase;
  let assignment: typeof shiftAssignments.$inferSelect;
  const sender = { send: vi.fn(async () => ({ messageId: 1 })) };
  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    sender.send.mockReset().mockResolvedValue({ messageId: 1 });
    await testDb.db.execute(sql`TRUNCATE notification_outbox, sites, employees CASCADE`);
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'test', name: 'Test', timezone: 'Europe/Kyiv' })
      .returning();
    if (!site) throw new Error('Missing site fixture');
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site.id, name: 'Unit' })
      .returning();
    if (!unit) throw new Error('Missing unit fixture');
    const [employee] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Test', locale: 'uk' })
      .returning();
    if (!employee) throw new Error('Missing employee fixture');
    await testDb.db
      .insert(telegramAccounts)
      .values({ employeeId: employee.id, telegramUserId: 777 });
    const [template] = await testDb.db
      .insert(shiftTemplates)
      .values({ siteId: site.id, code: 'DAY', name: 'Day', localStart: '06:30', localEnd: '18:30' })
      .returning();
    if (!template) throw new Error('Missing template fixture');
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId: site.id,
        orgUnitId: unit.id,
        periodMonth: '2026-10',
        versionNo: 1,
        status: 'PUBLISHED',
      })
      .returning();
    if (!version) throw new Error('Missing version fixture');
    const [row] = await testDb.db
      .insert(shiftAssignments)
      .values({
        scheduleVersionId: version.id,
        employeeId: employee.id,
        templateId: template.id,
        orgUnitId: unit.id,
        businessDate: '2026-10-01',
        planStartAt: start,
        planEndAt: new Date('2026-10-01T15:30:00Z'),
      })
      .returning();
    if (!row) throw new Error('Missing row fixture');
    assignment = row;
  });

  const enqueue = (now = early) =>
    handleShiftReminder(
      testDb.db,
      { assignmentId: assignment.id, fireAt: early.toISOString() },
      now,
    );
  const deliver = (now = due) => relayOnce(testDb.db, sender, { now: () => now });
  const absence = (
    type: 'VACATION' | 'SICK' | 'DAY_OFF',
    status: RequestStatus = 'APPROVED',
    from = '2026-10-01',
    to = from,
  ) =>
    testDb.db
      .insert(requests)
      .values({ employeeId: assignment.employeeId, type, status, periodFrom: from, periodTo: to });

  it('defaults to 30 minutes and defers an old two-hour timer without losing it', async () => {
    expect(
      WorkerEnvSchema.parse({ DATABASE_URL: 'db', REDIS_URL: 'redis' }).SHIFT_REMINDER_MINUTES,
    ).toBe(30);
    expect(await enqueue()).toBe('queued');
    expect(await enqueue()).toBe('duplicate');
    const [notice] = await testDb.db.select().from(notificationOutbox);
    expect(notice?.nextAttemptAt).toEqual(due);
    await deliver(new Date(due.getTime() - 1));
    expect(sender.send).not.toHaveBeenCalled();
    expect(await deliver()).toMatchObject({ sent: 1 });
    expect(sender.send).toHaveBeenCalledWith(
      777,
      expect.objectContaining({ text: expect.stringContaining('06:30') }),
    );
    await deliver();
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('defers already queued legacy messages without consuming delivery attempts', async () => {
    await enqueue();
    await testDb.db.update(notificationOutbox).set({ nextAttemptAt: early });
    expect(await deliver(early)).toMatchObject({ deferred: 1, sent: 0 });
    const [notice] = await testDb.db.select().from(notificationOutbox);
    expect(notice).toMatchObject({ attempts: 0, status: 'PENDING', nextAttemptAt: due });
    expect(await deliver()).toMatchObject({ sent: 1 });
  });

  it.each(['VACATION', 'SICK', 'DAY_OFF'] as const)(
    'suppresses approved %s at admission and delivery',
    async (type) => {
      await enqueue();
      await absence(type);
      expect(await enqueue(due)).toBe('stale');
      expect(await deliver()).toMatchObject({ skipped: 1, sent: 0 });
      expect(sender.send).not.toHaveBeenCalled();
    },
  );

  it.each(['SUBMITTED', 'IN_REVIEW', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const)(
    'does not treat %s absence as approval',
    async (status) => {
      await absence('VACATION', status);
      expect(await enqueue()).toBe('queued');
      expect(await deliver()).toMatchObject({ sent: 1 });
    },
  );

  it('uses inclusive absence boundaries and allows the next business date', async () => {
    await absence('SICK', 'APPROVED', '2026-09-28', '2026-10-01');
    expect(await enqueue()).toBe('stale');
    await testDb.db.update(requests).set({ periodTo: '2026-09-30' });
    expect(await enqueue()).toBe('queued');
  });

  it('checks the night shift business date even when the reminder is on the preceding date', async () => {
    const nightStart = new Date('2026-10-01T21:15:00Z'); // Oct 2, 00:15 local.
    const nightDue = new Date('2026-10-01T20:45:00Z');
    await testDb.db.update(shiftTemplates).set({ isNight: true });
    await testDb.db.update(shiftAssignments).set({
      businessDate: '2026-10-02',
      planStartAt: nightStart,
      planEndAt: new Date(nightStart.getTime() + 12 * 3600_000),
    });
    await absence('VACATION', 'APPROVED', '2026-10-02');
    expect(await enqueue(nightDue)).toBe('stale');
    await testDb.db.update(requests).set({ status: 'REJECTED' });
    expect(await enqueue(nightDue)).toBe('queued');
    expect(await deliver(nightDue)).toMatchObject({ sent: 1 });
    expect(sender.send).toHaveBeenCalledWith(
      777,
      expect.objectContaining({ text: expect.stringContaining('00:15') }),
    );
  });

  it.each(['CANCELLED', 'REPLACED'] as const)(
    'drops queued messages for %s assignments',
    async (status) => {
      await enqueue();
      await testDb.db.update(shiftAssignments).set({ status });
      expect(await deliver()).toMatchObject({ skipped: 1 });
      expect(sender.send).not.toHaveBeenCalled();
    },
  );

  it('drops queued messages from superseded schedules', async () => {
    await enqueue();
    await testDb.db.update(scheduleVersions).set({ status: 'SUPERSEDED' });
    expect(await deliver()).toMatchObject({ skipped: 1 });
  });

  it.each(['BLOCKED', 'TERMINATED'] as const)(
    'does not notify an employee who became %s',
    async (status) => {
      await enqueue();
      await testDb.db.update(employees).set({ status });
      expect(await deliver()).toMatchObject({ skipped: 1 });
    },
  );

  it('does not deliver at or after the shift start', async () => {
    await enqueue();
    expect(await deliver(start)).toMatchObject({ skipped: 1 });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('rechecks an approved absence after a Telegram retry', async () => {
    await enqueue();
    sender.send.mockRejectedValueOnce(new SendError('RETRY', 'Unavailable'));
    expect(await deliver()).toMatchObject({ retried: 1 });
    await absence('SICK');
    expect(await deliver(new Date(due.getTime() + 60_000))).toMatchObject({ skipped: 1 });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('suppresses reminders for an already opened assignment', async () => {
    await enqueue();
    await testDb.db.insert(shiftSessions).values({
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      businessDate: assignment.businessDate,
      state: 'WORKING',
      startedAt: early,
    });
    expect(await deliver()).toMatchObject({ skipped: 1 });
  });

  it('suppresses an approved cannot-attend request for the scheduled assignment', async () => {
    await enqueue();
    await testDb.db.insert(requests).values({
      employeeId: assignment.employeeId,
      assignmentId: assignment.id,
      type: 'CANNOT_ATTEND',
      status: 'APPROVED',
    });
    expect(await enqueue(due)).toBe('stale');
    expect(await deliver()).toMatchObject({ skipped: 1, sent: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
