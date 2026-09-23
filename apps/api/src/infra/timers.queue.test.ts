import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { backgroundTasks, employees, eq, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { TimerScheduler } from './timers.queue.js';

const ASSIGNMENT = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

describe('durable timer source admission', () => {
  let testDb: TestDatabase;
  const timers = new TimerScheduler();
  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE background_tasks, employees CASCADE`);
  });

  it('retains original overdue intent and deduplicates replay without Redis', async () => {
    const fireAt = new Date(Date.now() - 60_000);
    await testDb.db.transaction(async (tx) => {
      await timers.scheduleShiftReminder(tx, ASSIGNMENT, fireAt);
      await timers.scheduleShiftReminder(tx, ASSIGNMENT, fireAt);
      await timers.scheduleBirthdayGreeting(tx, EMPLOYEE, fireAt);
    });
    const rows = await testDb.db.select().from(backgroundTasks);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.status === 'PENDING' && row.dueAt.getTime() === fireAt.getTime()),
    ).toBe(true);
    expect(rows.find((row) => row.kind === 'SHIFT_REMINDER')?.payload).toEqual({
      assignmentId: ASSIGNMENT,
      fireAt: fireAt.toISOString(),
    });
  });

  it('rolls back source and every timer together after admission failure', async () => {
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx
          .insert(employees)
          .values({ id: EMPLOYEE, personnelNumber: 'timer-source', fullName: 'Timer Source' });
        await timers.scheduleBirthdayGreeting(tx, EMPLOYEE, new Date());
        throw new Error('Injected source failure');
      }),
    ).rejects.toThrow('Injected source failure');
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(0);
    expect(await testDb.db.select().from(employees).where(eq(employees.id, EMPLOYEE))).toHaveLength(
      0,
    );
  });
  it('logs the durable task identity as staged while preserving rollback semantics', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const scheduler = new TimerScheduler();
    const employeeId = 'a0000000-0000-4000-8000-000000000001';
    const fireAt = new Date('2026-09-01T00:00:00Z');
    try {
      await testDb.db.transaction((tx) =>
        scheduler.scheduleBirthdayGreeting(tx, employeeId, fireAt),
      );
      const [task] = await testDb.db.select().from(backgroundTasks);
      expect(log).toHaveBeenLastCalledWith({
        event: 'task_intent_staged',
        taskId: task?.id,
        kind: 'BIRTHDAY_GREETING',
      });
      await expect(
        testDb.db.transaction(async (tx) => {
          await scheduler.scheduleBirthdayGreeting(
            tx,
            'a0000000-0000-4000-8000-000000000002',
            fireAt,
          );
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(1);
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});
