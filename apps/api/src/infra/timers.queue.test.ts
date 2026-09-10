import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { backgroundTasks, employees, eq, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { TimerScheduler } from './timers.queue.js';

const ASSIGNMENT = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
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
      await timers.scheduleAckReminder(tx, VERSION, EMPLOYEE, fireAt);
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
        await timers.scheduleAckReminder(tx, VERSION, EMPLOYEE, new Date());
        throw new Error('Injected source failure');
      }),
    ).rejects.toThrow('Injected source failure');
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(0);
    expect(await testDb.db.select().from(employees).where(eq(employees.id, EMPLOYEE))).toHaveLength(
      0,
    );
  });
});
