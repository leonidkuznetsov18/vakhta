import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  domainEvents,
  employees,
  eq,
  notificationOutbox,
  reasonCodes,
  shiftSessions,
  sql,
} from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { handleDowntimeEscalation, handleReturnReminder } from './timers/shift-timers.js';

describe('worker: таймери зміни (FR-BRK-01, FR-DWN-04)', () => {
  let testDb: TestDatabase;
  let employeeId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE notification_outbox, activity_intervals, shift_sessions, employees, reason_codes CASCADE`,
    );
    const [emp] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Иванов Иван' })
      .returning();
    employeeId = emp!.id;
    await testDb.db
      .insert(reasonCodes)
      .values({ kind: 'DOWNTIME', code: 'BREAKDOWN', label: 'Поломка' });
  });

  async function session(
    state: 'BREAK' | 'DOWNTIME' | 'WORKING',
    reasonCode: string | null = null,
  ) {
    const startedAt = new Date(Date.now() - 20 * 60_000);
    const [s] = await testDb.db
      .insert(shiftSessions)
      .values({
        employeeId,
        businessDate: '2026-10-01',
        state,
        resumeState: state === 'WORKING' ? null : 'WORKING',
        version: 4,
        startedAt: new Date(startedAt.getTime() - 3_600_000),
      })
      .returning();
    const [i] = await testDb.db
      .insert(activityIntervals)
      .values({ shiftSessionId: s!.id, state, startedAt, resumeState: s!.resumeState, reasonCode })
      .returning();
    return { sessionId: s!.id, intervalId: i!.id };
  }

  it('нагадування повернутись іде працівнику з кнопкою «Вернуться» і актуальною версією', async () => {
    const { sessionId, intervalId } = await session('BREAK');
    const job = {
      sessionId,
      intervalId,
      state: 'BREAK' as const,
      limitMinutes: 15,
      fireAt: new Date().toISOString(),
    };
    expect(await handleReturnReminder(testDb.db, job)).toBe('queued');
    expect(await handleReturnReminder(testDb.db, job)).toBe('duplicate');
    const [row] = await testDb.db.select().from(notificationOutbox);
    expect(row?.recipientId).toBe(employeeId);
    expect(row?.payload.buttons?.[0]?.[0]?.callbackData).toBe('sh:RESUME:4');
    expect(row?.payload.text).toContain('15');
  });

  it('якщо працівник уже повернувся, нагадування не надсилається', async () => {
    const { sessionId, intervalId } = await session('BREAK');
    await testDb.db
      .update(activityIntervals)
      .set({ endedAt: new Date() })
      .where(eq(activityIntervals.id, intervalId));
    await testDb.db
      .update(shiftSessions)
      .set({ state: 'WORKING', resumeState: null })
      .where(eq(shiftSessions.id, sessionId));
    expect(
      await handleReturnReminder(testDb.db, {
        sessionId,
        intervalId,
        state: 'BREAK',
        limitMinutes: 15,
        fireAt: new Date().toISOString(),
      }),
    ).toBe('stale');
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it('ескалація простою пише подію DOWNTIME_ESCALATED один раз із тривалістю і причиною', async () => {
    const { sessionId, intervalId } = await session('DOWNTIME', 'BREAKDOWN');
    const job = { sessionId, intervalId, thresholdMinutes: 15, fireAt: new Date().toISOString() };
    expect(await handleDowntimeEscalation(testDb.db, job)).toBe('queued');
    expect(await handleDowntimeEscalation(testDb.db, job)).toBe('duplicate');
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DOWNTIME_ESCALATED');
    expect(events[0]?.payload['minutes']).toBeGreaterThanOrEqual(19);
    expect(String(events[0]?.payload['text'])).toContain('Поломка');
  });
});
