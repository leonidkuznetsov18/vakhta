import { messages } from '@vakhta/i18n';
import { CorrectionsService } from '../requests/corrections.service.js';
import { orderedShiftIntervals } from './shift-intervals.js';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { ShiftAutoCloseService } from './shift-auto-close.service.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activityIntervals,
  auditLog,
  notificationOutbox,
  qrChallenges,
  qrTerminals,
  domainEvents,
  employees,
  eq,
  presenceSessions,
  shiftSessions,
  shiftSummaries,
  sites,
  sql,
} from '@vakhta/db';
import { hashChallengeToken } from '@vakhta/domain/node';
import { DEFAULT_ATTENDANCE_WINDOW, checkIntervalInvariants } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from './shift-changes.js';
import { ShiftService } from './shift.service.js';

const START = new Date('2026-09-10T05:00:00Z');
const END = new Date('2026-09-10T17:00:00Z');
const DEADLINE = new Date('2026-09-10T19:00:00Z');
const OPTIONS = {
  breakMinutes: 15,
  mealMinutes: 30,
  serviceTimeMinutes: 30,
  downtimeEscalationMinutes: 15,
  graceMinutes: 10,
  earlyStartWindowMinutes: 30,
  overtimeThresholdMinutes: 15,
  defaultTimezone: 'Europe/Kyiv',
  autoCloseGraceMinutes: 120,
};

describe('Estimated closure preserves observed history without scanner-delay minutes', () => {
  let testDb: TestDatabase;
  let attendance: AttendanceService;
  let shifts: ShiftService;
  let employeeId: string;
  let sessionId: string;
  let presenceId: string;
  let command = 0;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE employees, sites, idempotency_keys, notification_outbox CASCADE`,
    );
    vi.restoreAllMocks();
    const events = new EventStore();
    const audit = new AuditLog();
    attendance = new AttendanceService(testDb.db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shifts = new ShiftService(
      testDb.db,
      events,
      audit,
      new NotificationsService(),
      attendance,
      new ShiftChanges(),
      new InMemoryTimerScheduler(),
      OPTIONS,
    );
    await testDb.db.insert(sites).values({ code: 'main', name: 'Main', timezone: 'Europe/Kyiv' });
    const [employee] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: 'auto-close', fullName: 'Test worker' })
      .returning();
    if (!employee) throw new Error('Missing employee fixture');
    employeeId = employee.id;
    const arrival = await attendance.reserveCheckIn(
      { employeeId, action: 'ARRIVE', at: START.toISOString(), reasonCode: 'TEST' },
      employeeActor(employeeId),
    );
    if (!arrival.ok) throw new Error('Missing arrival fixture');
    presenceId = arrival.presence.id;
    const started = await shifts.start(
      employeeId,
      { idempotencyKey: 'start' },
      { actor: employeeActor(employeeId), source: 'TELEGRAM', now: START },
    );
    if (!started.ok) throw new Error(`Failed to start: ${started.error}`);
    sessionId = started.session.id;
    await act('START_WORK', new Date(START.getTime() + 60_000));
  });

  async function act(action: Parameters<ShiftService['transition']>[1]['action'], now: Date) {
    const session = await shifts.activeSession(employeeId);
    if (!session) throw new Error('No active fixture shift');
    const result = await shifts.transition(
      employeeId,
      { action, expectedVersion: session.version, idempotencyKey: `act:${++command}` },
      { actor: employeeActor(employeeId), source: 'TELEGRAM', now },
    );
    if (!result.ok) throw new Error(`Action failed: ${result.error}`);
    return result;
  }

  it('closes exactly at the two-hour deadline with planned end and unknown physical departure', async () => {
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(1);
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    const [presence] = await testDb.db
      .select()
      .from(presenceSessions)
      .where(eq(presenceSessions.id, presenceId));
    const [summary] = await testDb.db
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId));
    expect(session).toMatchObject({
      state: 'SHIFT_CLOSED',
      endedAt: END,
      updatedAt: DEADLINE,
      needsClarification: true,
    });
    expect(presence).toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      departedAt: null,
      departureMethod: null,
    });
    expect(summary).toMatchObject({ totalMinutes: 720, plannedMinutes: 720, computedAt: DEADLINE });
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(0);
  });

  it('clips closed and open grace intervals while retaining their original timestamps in compensation', async () => {
    await act('START_BREAK', new Date('2026-09-10T17:15:00Z'));
    await act('RESUME', new Date('2026-09-10T17:30:00Z'));
    const before = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(activityIntervals.startedAt);
    const observedAt = new Date('2026-09-11T03:00:00Z');
    expect(await shifts.autoCloseStale(observedAt)).toBe(1);
    const after = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(activityIntervals.startedAt, activityIntervals.createdAt, activityIntervals.id);
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
    expect(after.filter((row) => row.startedAt >= END)).toHaveLength(2);
    expect(after.every((row) => row.endedAt !== null && row.endedAt <= END)).toBe(true);
    expect(
      checkIntervalInvariants(
        after.map((row) => ({
          ...row,
          startedAt: row.startedAt.getTime(),
          endedAt: row.endedAt?.getTime() ?? null,
        })),
        {
          shiftStartedAt: START.getTime(),
          shiftEndedAt: END.getTime(),
          now: observedAt.getTime(),
        },
      ),
    ).toEqual([]);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    const compensation = events.find((event) => event.type === 'SHIFT_AUTO_CLOSE_PROJECTED');
    expect(compensation).toMatchObject({
      occurredAt: observedAt,
      payload: {
        observedAt: observedAt.toISOString(),
        effectiveEndedAt: END.toISOString(),
        actualDepartureKnown: false,
        changes: expect.arrayContaining([
          expect.objectContaining({
            before: expect.objectContaining({ startedAt: '2026-09-10T17:15:00.000Z' }),
          }),
        ]),
      },
    });
  });
  async function ready() {
    await act('START_CLEANING', new Date('2026-09-10T16:57:00Z'));
    await act('CLEANING_DONE', new Date('2026-09-10T16:58:00Z'));
    await act('SUBMIT_HANDOVER', new Date('2026-09-10T16:59:00Z'));
  }

  async function challenge(at: Date) {
    const [site] = await testDb.db.select().from(sites);
    if (!site) throw new Error('Missing site');
    const [terminal] = await testDb.db
      .insert(qrTerminals)
      .values({ siteId: site.id, name: 'Main' })
      .returning();
    if (!terminal) throw new Error('Missing terminal');
    const token = 'B'.repeat(22);
    await testDb.db.insert(qrChallenges).values({
      terminalId: terminal.id,
      tokenHash: hashChallengeToken(token),
      issuedAt: at,
      expiresAt: new Date(at.getTime() + 60_000),
    });
    return token;
  }

  it.each(['2026-09-10T17:00:00Z', '2026-09-10T18:33:00Z'])(
    'records actual QR departure at %s during grace',
    async (time) => {
      await ready();
      const at = new Date(time);
      const token = await challenge(at);
      const result = await shifts.departByQr(employeeId, token, 'actual-qr', at, presenceId);
      expect(result).toMatchObject({
        kind: 'CHECK_IN',
        result: { ok: true, presence: { departedAt: at.toISOString() } },
      });
      const [row] = await testDb.db
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, sessionId));
      expect(row).toMatchObject({ endedAt: at, autoCloseReason: null });
      const [summary] = await testDb.db
        .select()
        .from(shiftSummaries)
        .where(eq(shiftSummaries.shiftSessionId, sessionId));
      expect(summary?.totalMinutes).toBe((at.getTime() - START.getTime()) / 60_000);
      expect(
        await shifts.departByQr(
          employeeId,
          token,
          'actual-qr',
          new Date(DEADLINE.getTime() + 60_000),
          presenceId,
        ),
      ).toMatchObject({ result: { ok: true, alreadyRecorded: true } });
      expect(await shifts.autoCloseStale(DEADLINE)).toBe(0);
    },
  );

  it('rejects an expired QR without changing an overdue shift, then catches up independently', async () => {
    await ready();
    const token = await challenge(END);
    const before = await shifts.activeSession(employeeId);
    expect(
      await shifts.departByQr(employeeId, token, 'expired', DEADLINE, presenceId),
    ).toMatchObject({ result: { ok: false, reason: 'CHALLENGE_EXPIRED' } });
    expect(await shifts.activeSession(employeeId)).toEqual(before);
    expect(await attendance.openPresence(employeeId)).toMatchObject({ id: presenceId });
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(1);
  });

  it('uses the deadline gate even when no scanner has run', async () => {
    const session = await shifts.activeSession(employeeId);
    if (!session) throw new Error('Missing shift');
    const result = await shifts.transition(
      employeeId,
      { action: 'START_BREAK', expectedVersion: session.version, idempotencyKey: 'late-command' },
      { actor: employeeActor(employeeId), source: 'TELEGRAM', now: DEADLINE },
    );
    expect(result).toMatchObject({ ok: false, error: 'NO_ACTIVE_SHIFT' });
    expect(await shifts.activeSession(employeeId)).toBeNull();
    const rows = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId));
    expect(rows.some((row) => row.state === 'BREAK')).toBe(false);
    expect(rows.every((row) => row.endedAt !== null && row.endedAt <= END)).toBe(true);
  });

  it('rolls back intervals, shift, presence and compensation when reconciliation fails', async () => {
    const before = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId));
    vi.spyOn(attendance, 'markDepartureUnknownWithin').mockRejectedValueOnce(
      new Error('Injected presence failure'),
    );
    await expect(shifts.reconcileEmployee(employeeId, DEADLINE)).rejects.toThrow(
      'Injected presence failure',
    );
    expect(await shifts.activeSession(employeeId)).toMatchObject({
      state: 'WORKING',
      endedAt: null,
    });
    expect(await attendance.openPresence(employeeId)).toMatchObject({ id: presenceId });
    expect(
      await testDb.db
        .select()
        .from(activityIntervals)
        .where(eq(activityIntervals.shiftSessionId, sessionId)),
    ).toEqual(before);
    expect(
      (
        await testDb.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.shiftSessionId, sessionId))
      ).some((event) => event.type === 'SHIFT_AUTO_CLOSE_PROJECTED'),
    ).toBe(false);
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(1);
  });

  it('serializes duplicate scanners, a deadline QR, master close and a new start', async () => {
    await ready();
    const token = await challenge(DEADLINE);
    const current = await shifts.activeSession(employeeId);
    if (!current) throw new Error('Missing shift');
    const results = await Promise.all([
      shifts.autoCloseStale(DEADLINE),
      shifts.autoCloseStale(DEADLINE),
      shifts.departByQr(employeeId, token, 'deadline-qr', DEADLINE, presenceId),
      shifts.masterTransition(
        sessionId,
        {
          action: 'CLOSE_SHIFT',
          expectedVersion: current.version,
          idempotencyKey: 'deadline-master',
          comment: 'Test confirmation',
        },
        { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
        DEADLINE,
      ),
      shifts.start(
        employeeId,
        { idempotencyKey: 'deadline-start' },
        { actor: employeeActor(employeeId), source: 'TELEGRAM', now: DEADLINE },
      ),
    ]);
    expect(results[2]).toMatchObject({ result: { ok: false, reason: 'NOT_ARRIVED' } });
    expect(results[4]).toMatchObject({ ok: false, error: 'PRESENCE_REQUIRED' });
    expect(await testDb.db.select().from(shiftSessions)).toHaveLength(1);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(events.filter((event) => event.type === 'SHIFT_AUTO_CLOSE_PROJECTED')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'PRESENCE_DEPARTURE_UNKNOWN')).toHaveLength(1);
  });

  it('recovers a missing legacy plan from the original start rather than scanner time', async () => {
    await testDb.db
      .update(shiftSessions)
      .set({ planStartAt: null, planEndAt: null })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.autoCloseStale(new Date('2026-09-15T12:00:00Z'))).toBe(1);
    const [row] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    expect(row).toMatchObject({ planStartAt: START, planEndAt: END, endedAt: END });
    expect(
      (
        await testDb.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.shiftSessionId, sessionId))
      ).filter((event) => event.type === 'SHIFT_PLAN_RECOVERED'),
    ).toHaveLength(1);
  });

  it.each([
    ['Europe/Kyiv', '2026-09-10T17:00:00Z', '2026-09-11T05:00:00Z', 720],
    ['Europe/Kyiv', '2026-03-28T18:00:00Z', '2026-03-29T05:00:00Z', 660],
    ['Europe/Kyiv', '2026-10-24T17:00:00Z', '2026-10-25T06:00:00Z', 780],
    ['America/New_York', '2026-09-10T12:00:00Z', '2026-09-11T00:00:00Z', 720],
  ])(
    'persists the %s unscheduled plan, including night and DST (%s)',
    async (timezone, start, end, minutes) => {
      await testDb.db.update(sites).set({ timezone });
      const [employee] = await testDb.db
        .insert(employees)
        .values({ personnelNumber: 'another', fullName: 'Another worker' })
        .returning();
      if (!employee) throw new Error('Missing employee');
      await attendance.reserveCheckIn(
        { employeeId: employee.id, action: 'ARRIVE', at: start, reasonCode: 'TEST' },
        employeeActor(employee.id),
      );
      const started = await shifts.start(
        employee.id,
        { idempotencyKey: 'night-start' },
        { actor: employeeActor(employee.id), source: 'TELEGRAM', now: new Date(start) },
      );
      if (!started.ok) throw new Error(started.error);
      expect(started.session).toMatchObject({
        planStartAt: new Date(start).toISOString(),
        planEndAt: new Date(end).toISOString(),
      });
      const deadline = new Date(new Date(end).getTime() + 120 * 60_000);
      expect(await shifts.reconcileEmployee(employee.id, new Date(deadline.getTime() - 1))).toBe(
        false,
      );
      expect(await shifts.reconcileEmployee(employee.id, deadline)).toBe(true);
      const [summary] = await testDb.db
        .select()
        .from(shiftSummaries)
        .where(eq(shiftSummaries.shiftSessionId, started.session.id));
      expect(summary).toMatchObject({ totalMinutes: minutes, plannedMinutes: minutes });
    },
  );

  it('audits only orphaned open presence linked exclusively to terminal shifts and does not replay the repair', async () => {
    await ready();
    const current = await shifts.activeSession(employeeId);
    if (!current) throw new Error('Missing shift');
    const result = await shifts.masterTransition(
      sessionId,
      {
        action: 'CLOSE_SHIFT',
        expectedVersion: current.version,
        idempotencyKey: 'master-close',
        comment: 'Recorded master closure',
      },
      { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
      END,
    );
    expect(result.ok).toBe(true);
    const closedBefore = await testDb.db.select().from(shiftSessions);
    await shifts.reconcileEmployee(employeeId, DEADLINE);
    await shifts.reconcileEmployee(employeeId, DEADLINE);
    expect(await testDb.db.select().from(shiftSessions)).toEqual(closedBefore);
    const [presence] = await testDb.db
      .select()
      .from(presenceSessions)
      .where(eq(presenceSessions.id, presenceId));
    expect(presence).toMatchObject({ status: 'NEEDS_CLARIFICATION', departedAt: null });
    expect(
      (await testDb.db.select().from(auditLog).where(eq(auditLog.objectId, presenceId))).filter(
        (entry) => entry.action === 'presence.reconcile_unknown_departure',
      ),
    ).toHaveLength(1);
    await attendance.reserveCheckIn(
      { employeeId, action: 'ARRIVE', at: DEADLINE.toISOString(), reasonCode: 'TEST' },
      employeeActor(employeeId),
    );
    const fresh = await attendance.openPresence(employeeId);
    await shifts.reconcileEmployee(employeeId, DEADLINE);
    expect(await attendance.openPresence(employeeId)).toEqual(fresh);
    const token = await challenge(DEADLINE);
    expect(
      await shifts.departByQr(employeeId, token, 'stale-presence', DEADLINE, presenceId),
    ).toMatchObject({ result: { ok: false, reason: 'NOT_ARRIVED' } });
    expect(await attendance.openPresence(employeeId)).toEqual(fresh);
  });
  it('preserves a valid persisted end when only the plan start is missing', async () => {
    const originalEnd = new Date(END.getTime() + 30 * 60_000);
    await testDb.db
      .update(shiftSessions)
      .set({ planStartAt: null, planEndAt: originalEnd })
      .where(eq(shiftSessions.id, sessionId));
    expect(
      await shifts.reconcileEmployee(employeeId, new Date(DEADLINE.getTime() + 30 * 60_000)),
    ).toBe(true);
    const [row] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    expect(row).toMatchObject({ planEndAt: originalEnd, endedAt: originalEnd });
  });

  it('anchors a missing legacy start and plan to the first recorded interval', async () => {
    await testDb.db
      .update(shiftSessions)
      .set({
        startedAt: null,
        planStartAt: null,
        planEndAt: null,
        createdAt: new Date('2026-09-15T12:00:00Z'),
      })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.reconcileEmployee(employeeId, DEADLINE)).toBe(true);
    const [row] = await testDb.db
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId));
    expect(row).toMatchObject({ totalMinutes: 720, plannedMinutes: 720 });
  });

  it('flags an invalid persisted boundary without replacing it or deleting history', async () => {
    const invalidEnd = new Date(START.getTime() - 60_000);
    await testDb.db
      .update(shiftSessions)
      .set({ planEndAt: invalidEnd })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(0);
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(0);
    expect(await shifts.activeSession(employeeId)).toMatchObject({
      planEndAt: invalidEnd,
      needsClarification: true,
      clarificationReason: 'INVALID_PLAN',
      endedAt: null,
    });
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(events.filter((event) => event.type === 'SHIFT_PLAN_INVALID')).toHaveLength(1);
  });

  it('continues the scan after one employee fails and retries that employee later', async () => {
    const [other] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: 'scan-next', fullName: 'Next worker' })
      .returning();
    if (!other) throw new Error('Missing employee');
    await attendance.reserveCheckIn(
      { employeeId: other.id, action: 'ARRIVE', at: START.toISOString(), reasonCode: 'TEST' },
      employeeActor(other.id),
    );
    await shifts.start(
      other.id,
      { idempotencyKey: 'other-start' },
      { actor: employeeActor(other.id), source: 'TELEGRAM', now: START },
    );
    const reconcile = shifts.reconcileEmployee.bind(shifts);
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(shifts, 'reconcileEmployee').mockImplementation(async (id, now, expected) => {
      if (id === employeeId) throw new Error('Injected single-employee failure');
      return reconcile(id, now, expected);
    });
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(1);
    expect(await shifts.activeSession(other.id)).toBeNull();
    expect(await shifts.activeSession(employeeId)).not.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    vi.mocked(shifts.reconcileEmployee).mockRestore();
    expect(await shifts.autoCloseStale(DEADLINE)).toBe(1);
  });

  it('scans on startup and periodically, then stops on shutdown', async () => {
    const scan = vi.spyOn(shifts, 'autoCloseStale').mockResolvedValue(0);
    const driver = new ShiftAutoCloseService(
      shifts,
      new ConfigService<Env, true>({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        AUTO_CLOSE_SCAN_MINUTES: 10,
      }),
    );
    vi.useFakeTimers();
    try {
      driver.onModuleInit();
      expect(scan).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(scan).toHaveBeenCalledTimes(2);
      driver.onApplicationShutdown();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(scan).toHaveBeenCalledTimes(2);
    } finally {
      driver.onApplicationShutdown();
      vi.useRealTimers();
    }
  });

  it('preserves invalid QR security evidence without closing the overdue shift', async () => {
    await ready();
    expect(
      await shifts.departByQr(employeeId, 'Z'.repeat(22), 'invalid-qr', DEADLINE, presenceId),
    ).toMatchObject({ result: { ok: false, reason: 'CHALLENGE_INVALID' } });
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, employeeId));
    expect(events.filter((event) => event.type === 'QR_CHALLENGE_REJECTED')).toHaveLength(1);
    expect(await shifts.activeSession(employeeId)).toMatchObject({
      state: 'READY_TO_CLOSE',
      endedAt: null,
    });
    expect(await attendance.openPresence(employeeId)).toMatchObject({ id: presenceId });
  });

  it('flags ambiguous historical site or missing recorded start instead of inventing a plan', async () => {
    await testDb.db
      .insert(sites)
      .values({ code: 'another', name: 'Another site', timezone: 'America/New_York' });
    await testDb.db
      .update(shiftSessions)
      .set({ planStartAt: null, planEndAt: null })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.reconcileEmployee(employeeId, DEADLINE)).toBe(false);
    expect(await shifts.activeSession(employeeId)).toMatchObject({
      clarificationReason: 'UNRECOVERABLE_PLAN',
      planStartAt: null,
      planEndAt: null,
      endedAt: null,
    });
    await testDb.db
      .delete(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId));
    await testDb.db
      .update(shiftSessions)
      .set({ startedAt: null, clarificationReason: null })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.reconcileEmployee(employeeId, DEADLINE)).toBe(false);
    expect(await shifts.activeSession(employeeId)).toMatchObject({
      clarificationReason: 'UNRECOVERABLE_PLAN',
      startedAt: null,
      endedAt: null,
    });
  });

  it('does not let a same-day stale arrival replace the recorded night-shift start during recovery', async () => {
    const nightStart = new Date('2026-09-10T18:00:00Z');
    await testDb.db
      .delete(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId));
    await testDb.db
      .insert(activityIntervals)
      .values({ shiftSessionId: sessionId, state: 'WORKING', startedAt: nightStart });
    await testDb.db
      .update(shiftSessions)
      .set({ startedAt: nightStart, planStartAt: null, planEndAt: null })
      .where(eq(shiftSessions.id, sessionId));
    expect(await shifts.reconcileEmployee(employeeId, new Date('2026-09-11T07:00:00Z'))).toBe(true);
    const [row] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    expect(row).toMatchObject({
      planEndAt: new Date('2026-09-11T05:00:00Z'),
      endedAt: new Date('2026-09-11T05:00:00Z'),
    });
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(events.find((event) => event.type === 'SHIFT_PLAN_RECOVERED')?.payload).toMatchObject({
      anchor: nightStart.toISOString(),
      inferredFromUniqueSite: true,
    });
  });

  it('preserves original interval order for corrections after tied zero-length projection', async () => {
    await act('START_BREAK', new Date('2026-09-10T17:15:00Z'));
    await act('RESUME', new Date('2026-09-10T17:30:00Z'));
    const original = await orderedShiftIntervals(testDb.db, sessionId);
    const last = original.at(-1);
    const previous = original.at(-2);
    if (!last || !previous) throw new Error('Missing grace intervals');
    const workId = '00000000-0000-4000-8000-000000000001';
    const breakId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await testDb.db
      .update(activityIntervals)
      .set({ id: workId, createdAt: START })
      .where(eq(activityIntervals.id, last.id));
    await testDb.db
      .update(activityIntervals)
      .set({ id: breakId, createdAt: START })
      .where(eq(activityIntervals.id, previous.id));
    expect(await shifts.reconcileEmployee(employeeId, DEADLINE)).toBe(true);
    expect(
      (await orderedShiftIntervals(testDb.db, sessionId)).slice(-2).map((row) => row.id),
    ).toEqual([breakId, workId]);
    const corrections = new CorrectionsService(testDb.db, new EventStore(), new AuditLog(), shifts);
    const correctedEnd = new Date(END.getTime() + 10 * 60_000);
    await corrections.apply(
      sessionId,
      {
        proposal: { kind: 'CLOSE_SHIFT_AT', endedAt: correctedEnd.toISOString() },
        reasonCode: 'TEST',
        comment: 'Reviewed accounting end',
      },
      { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
      DEADLINE,
    );
    let rows = await orderedShiftIntervals(testDb.db, sessionId);
    expect(rows.at(-1)).toMatchObject({ id: workId, state: 'WORKING', endedAt: correctedEnd });
    expect(rows.at(-2)).toMatchObject({ id: breakId, state: 'BREAK', endedAt: END });
    const boundary = new Date(END.getTime() + 5 * 60_000);
    await corrections.apply(
      sessionId,
      {
        proposal: {
          kind: 'MOVE_BOUNDARY',
          intervalId: workId,
          newStartedAt: boundary.toISOString(),
        },
        reasonCode: 'TEST',
        comment: 'Reviewed boundary',
      },
      { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
      DEADLINE,
    );
    rows = await orderedShiftIntervals(testDb.db, sessionId);
    expect(rows.at(-2)).toMatchObject({ id: breakId, endedAt: boundary });
    expect(rows.at(-1)).toMatchObject({ id: workId, startedAt: boundary });
  });

  it('sends the estimated-closure explanation in the actual notification outbox payload', async () => {
    await shifts.reconcileEmployee(employeeId, DEADLINE);
    const rows = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, employeeId));
    const notification = rows.find((row) => row.template === 'SHIFT_SUMMARY');
    expect(notification?.payload.text).toContain(messages('ru').shift.estimatedClosure);
    expect(notification?.payload.text).not.toContain(messages('ru').shift.closedHeader);
  });
});
