import { messages } from '@vakhta/i18n';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activityIntervals,
  assignmentAcknowledgements,
  backgroundTasks,
  checklistDefinitions,
  claimBackgroundTasks,
  domainEvents,
  downtimeIncidents,
  employees,
  enqueueBackgroundTask,
  eq,
  handoverRecords,
  notificationOutbox,
  orgUnits,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import { timerTaskIntent, type TimerTask } from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { dispatchTimerTasks } from './timers/tasks.js';
import { recoverTimerTasks, TimerRecoveryOptions } from './timers/recovery.js';
import { handleReturnReminder } from './timers/shift-timers.js';
import { handleHandoverTimeout } from './timers/handover-timers.js';
import { TimerTaskRunner } from './timers/runner.js';

const past = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe('durable timers and legacy recovery', () => {
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
      sql`TRUNCATE background_tasks, notification_outbox, employees, sites, checklist_definitions, downtime_incidents CASCADE`,
    );
    const [employee] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: 'timer', fullName: 'Timer Worker', locale: 'en' })
      .returning();
    if (!employee) throw new Error('Employee fixture missing');
    employeeId = employee.id;
  });
  async function interval(state: 'BREAK' | 'DOWNTIME' = 'BREAK') {
    const [session] = await testDb.db
      .insert(shiftSessions)
      .values({
        employeeId,
        businessDate: '2026-09-10',
        state,
        resumeState: 'WORKING',
        startedAt: past(60),
        planEndAt: future(60),
      })
      .returning();
    if (!session) throw new Error('Session fixture missing');
    const [row] = await testDb.db
      .insert(activityIntervals)
      .values({ shiftSessionId: session.id, state, resumeState: 'WORKING', startedAt: past(20) })
      .returning();
    if (!row) throw new Error('Interval fixture missing');
    return { session, row };
  }
  async function admit(task: TimerTask) {
    await testDb.db.transaction((tx) => enqueueBackgroundTask(tx, timerTaskIntent(task)));
  }
  async function handover(status: 'SUBMITTED' | 'ACCEPTED' = 'SUBMITTED') {
    const { session } = await interval();
    const [definition] = await testDb.db
      .insert(checklistDefinitions)
      .values({ version: 1, items: [] })
      .returning();
    if (!definition) throw new Error('Checklist fixture missing');
    const [row] = await testDb.db
      .insert(handoverRecords)
      .values({
        shiftSessionId: session.id,
        submittedBy: employeeId,
        checklistDefinitionId: definition.id,
        status,
        submittedAt: past(120),
        acceptDeadlineAt: past(60),
      })
      .returning();
    if (!row) throw new Error('Handover fixture missing');
    return row;
  }
  async function schedule(start: Date) {
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'timer-site', name: 'Timer Site', timezone: 'Europe/Kyiv' })
      .returning();
    if (!site) throw new Error('Site fixture missing');
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site.id, name: 'Timer Unit' })
      .returning();
    const [template] = await testDb.db
      .insert(shiftTemplates)
      .values({ siteId: site.id, code: 'DAY', name: 'Day', localStart: '08:00', localEnd: '20:00' })
      .returning();
    if (!unit || !template) throw new Error('Schedule fixture missing');
    const publishedAt = past(48 * 60);
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId: site.id,
        orgUnitId: unit.id,
        periodMonth: '2026-09',
        versionNo: 1,
        status: 'PUBLISHED',
        publishedAt,
      })
      .returning();
    if (!version) throw new Error('Version fixture missing');
    const [assignment] = await testDb.db
      .insert(shiftAssignments)
      .values({
        scheduleVersionId: version.id,
        employeeId,
        templateId: template.id,
        businessDate: '2026-09-10',
        planStartAt: start,
        planEndAt: new Date(start.getTime() + 12 * 3_600_000),
        orgUnitId: unit.id,
      })
      .returning();
    if (!assignment) throw new Error('Assignment fixture missing');
    return { assignment, version, publishedAt };
  }

  it('recovers a lost admission and expired claim without replacing the task', async () => {
    const { row } = await interval();
    expect((await recoverTimerTasks(testDb.db)).admitted).toBe(2);
    const [lease] = await claimBackgroundTasks(testDb.db, {
      kinds: ['RETURN_REMINDER'],
      limit: 1,
      leaseMs: 60_000,
    });
    if (!lease) throw new Error('Expected return lease');
    await testDb.db.execute(
      sql`UPDATE background_tasks SET lease_until = clock_timestamp() - interval '1 second' WHERE id = ${lease.id}`,
    );
    expect((await recoverTimerTasks(testDb.db)).admitted).toBe(0);
    expect(await dispatchTimerTasks(testDb.db)).toMatchObject({ completed: 1, retried: 0 });
    const [after] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id));
    expect(after).toMatchObject({ id: lease.id, status: 'COMPLETED', attempts: 2 });
    const [notice] = await testDb.db.select().from(notificationOutbox);
    expect(notice?.dedupeKey).toBe(`return-reminder:${row.id}`);
  });

  it('commits one notice when legacy and PostgreSQL attempts overlap', async () => {
    const { session, row } = await interval();
    const payload = {
      sessionId: session.id,
      intervalId: row.id,
      state: 'BREAK' as const,
      limitMinutes: 15,
      fireAt: past(5).toISOString(),
    };
    await admit({ kind: 'RETURN_REMINDER', payload });
    await Promise.all([dispatchTimerTasks(testDb.db), handleReturnReminder(testDb.db, payload)]);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(1);
    const [task] = await testDb.db.select().from(backgroundTasks);
    expect(task?.status).toBe('COMPLETED');
  });

  it('rolls back notice and completion together and retries after the fault is removed', async () => {
    const { session, row } = await interval();
    await admit({
      kind: 'RETURN_REMINDER',
      payload: {
        sessionId: session.id,
        intervalId: row.id,
        state: 'BREAK',
        limitMinutes: 15,
        fireAt: past(5).toISOString(),
      },
    });
    await testDb.db.execute(
      sql`CREATE FUNCTION reject_timer_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'COMPLETED' THEN RAISE EXCEPTION 'Injected completion failure'; END IF; RETURN NEW; END $$`,
    );
    await testDb.db.execute(
      sql`CREATE TRIGGER reject_timer_completion BEFORE UPDATE ON background_tasks FOR EACH ROW EXECUTE FUNCTION reject_timer_completion()`,
    );
    try {
      expect((await dispatchTimerTasks(testDb.db)).retried).toBe(1);
      expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
    } finally {
      await testDb.db.execute(sql`DROP TRIGGER reject_timer_completion ON background_tasks`);
      await testDb.db.execute(sql`DROP FUNCTION reject_timer_completion()`);
    }
    await testDb.db.execute(
      sql`UPDATE background_tasks SET available_at = due_at WHERE status = 'PENDING'`,
    );
    expect((await dispatchTimerTasks(testDb.db)).completed).toBe(1);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(1);
  });

  it('rejects mismatched interval ownership and suppresses overdue auto-close reminders', async () => {
    const { session, row } = await interval();
    await testDb.db
      .update(shiftSessions)
      .set({ planEndAt: past(121) })
      .where(eq(shiftSessions.id, session.id));
    await admit({
      kind: 'RETURN_REMINDER',
      payload: {
        sessionId: session.id,
        intervalId: row.id,
        state: 'BREAK',
        limitMinutes: 15,
        fireAt: past(5).toISOString(),
      },
    });
    expect((await recoverTimerTasks(testDb.db)).admitted).toBe(0);
    await dispatchTimerTasks(testDb.db);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
    expect(
      await handleReturnReminder(testDb.db, {
        sessionId: crypto.randomUUID(),
        intervalId: row.id,
        state: 'BREAK',
        limitMinutes: 15,
        fireAt: past(5).toISOString(),
      }),
    ).toBe('stale');
  });

  it('preserves an original legacy limit and fire time instead of current fallback configuration', async () => {
    const { session, row } = await interval();
    const original = {
      sessionId: session.id,
      intervalId: row.id,
      state: 'BREAK',
      limitMinutes: 17,
      fireAt: new Date(row.startedAt.getTime() + 17 * 60_000).toISOString(),
    };
    const result = await recoverTimerTasks(
      testDb.db,
      { breakMinutes: 10 },
      {
        async read(key) {
          return key.startsWith('return-reminder.') ? original : null;
        },
      },
    );
    expect(result.legacyUsed).toBe(1);
    const [task] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'RETURN_REMINDER'));
    expect(task?.payload).toEqual(original);
    expect(task?.dueAt.toISOString()).toBe(original.fireAt);
  });

  it('rejects legacy return state mismatches without losing the eligible reminder', async () => {
    const { session, row } = await interval();
    const result = await recoverTimerTasks(
      testDb.db,
      { breakMinutes: 10 },
      {
        async read(key) {
          return key.startsWith('return-reminder.')
            ? {
                sessionId: session.id,
                intervalId: row.id,
                state: 'MEAL',
                limitMinutes: 17,
                fireAt: new Date(row.startedAt.getTime() + 17 * 60_000).toISOString(),
              }
            : null;
        },
      },
    );
    expect(result.legacyUsed).toBe(0);
    const [task] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'RETURN_REMINDER'));
    expect(task?.payload).toMatchObject({ state: 'BREAK', limitMinutes: 10 });
    await dispatchTimerTasks(testDb.db);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(1);
  });

  it('falls back visibly when Redis is unavailable and later repeats keep the original intent', async () => {
    await interval();
    const result = await recoverTimerTasks(
      testDb.db,
      { breakMinutes: 10 },
      {
        async read() {
          throw new Error('Unavailable');
        },
      },
    );
    expect(result).toMatchObject({
      admitted: 2,
      legacyUnavailable: true,
      currentConfigFallback: 2,
    });
    const first = await testDb.db.select().from(backgroundTasks);
    expect((await recoverTimerTasks(testDb.db, { breakMinutes: 30 })).admitted).toBe(0);
    expect(await testDb.db.select().from(backgroundTasks)).toEqual(first);
  });

  it('does not recover old schedule acknowledgement or shift reminders', async () => {
    await schedule(past(120));
    expect((await recoverTimerTasks(testDb.db)).admitted).toBe(0);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it('recovers future unacknowledged shifts at the original publication deadline', async () => {
    const { publishedAt } = await schedule(future(60));
    expect((await recoverTimerTasks(testDb.db)).admitted).toBe(2);
    const [ack] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'ACK_REMINDER'));
    expect(ack?.dueAt.getTime()).toBe(publishedAt.getTime() + 24 * 3_600_000);
    expect((await dispatchTimerTasks(testDb.db)).completed).toBe(2);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(2);
  });

  it('repairs null-zone legacy timeout and leaves an existing sent notice unchanged', async () => {
    const row = await handover();
    const occurredAt = past(30);
    await testDb.db.insert(domainEvents).values({
      type: 'HANDOVER_TIMEOUT',
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      shiftSessionId: row.shiftSessionId,
      occurredAt,
      idempotencyKey: `handover-timeout:${row.id}`,
    });
    await recoverTimerTasks(testDb.db);
    await dispatchTimerTasks(testDb.db);
    const [after] = await testDb.db
      .select()
      .from(handoverRecords)
      .where(eq(handoverRecords.id, row.id));
    expect(after?.escalatedToMasterAt).toEqual(occurredAt);
    const [notice] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, `handover-timeout:${row.id}`));
    expect(notice?.payload.text).toContain('review deadline elapsed');
    expect(notice?.payload.text).not.toContain('receiver');
    if (!notice || !row.acceptDeadlineAt) throw new Error('Expected legacy notice');
    await testDb.db
      .update(notificationOutbox)
      .set({ status: 'SENT', attempts: 1 })
      .where(eq(notificationOutbox.id, notice.id));
    await handleHandoverTimeout(testDb.db, {
      handoverId: row.id,
      fireAt: row.acceptDeadlineAt.toISOString(),
    });
    const [unchanged] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, notice.id));
    expect(unchanged?.status).toBe('SENT');
    expect(unchanged?.attempts).toBe(1);
  });

  it('repairs terminal legacy timeout timestamp without a late notification', async () => {
    const row = await handover('ACCEPTED');
    const occurredAt = past(30);
    await testDb.db.insert(domainEvents).values({
      type: 'HANDOVER_TIMEOUT',
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      shiftSessionId: row.shiftSessionId,
      occurredAt,
      idempotencyKey: `handover-timeout:${row.id}`,
    });
    await recoverTimerTasks(testDb.db);
    await dispatchTimerTasks(testDb.db);
    const [after] = await testDb.db
      .select()
      .from(handoverRecords)
      .where(eq(handoverRecords.id, row.id));
    expect(after?.escalatedToMasterAt).toEqual(occurredAt);
    expect(
      await testDb.db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.template, 'HANDOVER_PENDING')),
    ).toHaveLength(0);
  });

  it('keeps unsupported versions and envelope/deadline mismatches retryable', async () => {
    const { session, row } = await interval();
    const intent = timerTaskIntent({
      kind: 'RETURN_REMINDER',
      payload: {
        sessionId: session.id,
        intervalId: row.id,
        state: 'BREAK',
        limitMinutes: 15,
        fireAt: past(5).toISOString(),
      },
    });
    await testDb.db.transaction((tx) => enqueueBackgroundTask(tx, { ...intent, dueAt: past(10) }));
    const unsupported = timerTaskIntent({
      kind: 'CLEANING_REMINDER',
      payload: { sessionId: session.id, fireAt: past(5).toISOString() },
    });
    await testDb.db.transaction((tx) =>
      enqueueBackgroundTask(tx, { ...unsupported, payloadVersion: 2 }),
    );
    expect((await dispatchTimerTasks(testDb.db)).retried).toBe(2);
    const [after] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.dedupeKey, intent.dedupeKey));
    expect(after?.lastErrorCode).toBe('INVALID_PAYLOAD');
    const [unsupportedAfter] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'CLEANING_REMINDER'));
    expect(unsupportedAfter?.lastErrorCode).toBe('UNSUPPORTED_VERSION');
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it('repeats a bounded scan and includes a later commit with an older business deadline', async () => {
    for (let i = 0; i < 3; i++)
      await testDb.db.insert(downtimeIncidents).values({
        reasonCode: 'BREAKDOWN',
        severity: 'NORMAL',
        status: 'REPORTED',
        openedAt: past(120 + i),
        slaDueAt: past(60 + i),
        reportsCount: 1,
      });
    expect((await recoverTimerTasks(testDb.db, { limit: 2 })).admitted).toBe(2);
    expect((await recoverTimerTasks(testDb.db, { limit: 2 })).admitted).toBe(1);
    await testDb.db.insert(downtimeIncidents).values({
      reasonCode: 'BREAKDOWN',
      severity: 'NORMAL',
      status: 'REPORTED',
      openedAt: past(300),
      slaDueAt: past(240),
      reportsCount: 1,
    });
    expect((await recoverTimerTasks(testDb.db, { limit: 2 })).admitted).toBe(1);
  });

  it('runs startup recovery immediately and stops without another poll', async () => {
    await interval();
    let resolveRecovered: (() => void) | undefined;
    const recovered = new Promise<void>((resolve) => {
      resolveRecovered = resolve;
    });
    const runner = new TimerTaskRunner(testDb.db, TimerRecoveryOptions.parse({}), {
      dispatched() {},
      recovered() {
        resolveRecovered?.();
      },
      failed() {
        throw new Error('Unexpected runner failure');
      },
    });
    runner.start();
    runner.start();
    await recovered;
    await runner.stop();
    const rows = await testDb.db.select().from(backgroundTasks);
    expect(rows).toHaveLength(2);
  });
  it('waits for the acknowledgement version lock and suppresses the now-acknowledged reminder', async () => {
    const { version, assignment } = await schedule(future(60));
    await admit({
      kind: 'ACK_REMINDER',
      payload: { versionId: version.id, employeeId, fireAt: past(5).toISOString() },
    });
    let unlock: (() => void) | undefined;
    let ready: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const acknowledgement = testDb.db.transaction(async (tx) => {
      await tx
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, version.id))
        .for('no key update');
      ready?.();
      await released;
      await tx.insert(assignmentAcknowledgements).values({
        assignmentId: assignment.id,
        employeeId,
        scheduleVersionId: version.id,
        source: 'TELEGRAM',
      });
    });
    await locked;
    const dispatch = dispatchTimerTasks(testDb.db);
    try {
      await vi.waitFor(
        async () => {
          const rows = await testDb.db.execute(
            sql<{
              count: number;
            }>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
          );
          expect(rows[0]?.count).toBeGreaterThan(0);
        },
        { timeout: 5000, interval: 20 },
      );
    } finally {
      unlock?.();
    }
    await Promise.all([acknowledgement, dispatch]);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it('rechecks the deadline after waiting for the session mutex', async () => {
    const { session } = await interval();
    const deadline = new Date(Date.now() + 1000);
    await testDb.db
      .update(shiftSessions)
      .set({ planEndAt: deadline })
      .where(eq(shiftSessions.id, session.id));
    await admit({
      kind: 'CLEANING_REMINDER',
      payload: { sessionId: session.id, fireAt: past(5).toISOString() },
    });
    let unlock: (() => void) | undefined;
    let ready: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const holder = testDb.db.transaction(async (tx) => {
      await tx
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, session.id))
        .for('no key update');
      ready?.();
      await released;
    });
    await locked;
    const dispatch = dispatchTimerTasks(testDb.db);
    try {
      await vi.waitFor(
        async () => {
          const rows = await testDb.db.execute(
            sql<{
              count: number;
            }>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
          );
          expect(rows[0]?.count).toBeGreaterThan(0);
        },
        { timeout: 5000, interval: 20 },
      );
      await vi.waitFor(
        () => {
          expect(Date.now()).toBeGreaterThan(deadline.getTime());
        },
        { timeout: 5000, interval: 20 },
      );
    } finally {
      unlock?.();
    }
    await Promise.all([holder, dispatch]);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
    const [task] = await testDb.db.select().from(backgroundTasks);
    expect(task?.status).toBe('COMPLETED');
  });

  it('rolls back legacy timeout event and projection if notice insertion fails', async () => {
    const row = await handover();
    if (!row.acceptDeadlineAt) throw new Error('Expected deadline');
    const payload = { handoverId: row.id, fireAt: row.acceptDeadlineAt.toISOString() };
    await testDb.db.execute(
      sql`CREATE FUNCTION reject_timeout_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.template = 'HANDOVER_PENDING' THEN RAISE EXCEPTION 'Injected timeout notice failure'; END IF; RETURN NEW; END $$`,
    );
    await testDb.db.execute(
      sql`CREATE TRIGGER reject_timeout_notice BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION reject_timeout_notice()`,
    );
    try {
      await expect(handleHandoverTimeout(testDb.db, payload)).rejects.toThrow();
      const [after] = await testDb.db
        .select()
        .from(handoverRecords)
        .where(eq(handoverRecords.id, row.id));
      expect(after?.escalatedToMasterAt).toBeNull();
      expect(
        await testDb.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.idempotencyKey, `handover-timeout:${row.id}`)),
      ).toHaveLength(0);
    } finally {
      await testDb.db.execute(sql`DROP TRIGGER reject_timeout_notice ON notification_outbox`);
      await testDb.db.execute(sql`DROP FUNCTION reject_timeout_notice()`);
    }
    expect(await handleHandoverTimeout(testDb.db, payload)).toBe('queued');
  });

  it.each(['en', 'uk', 'ru'] as const)(
    'uses neutral null-zone timeout wording in %s',
    async (locale) => {
      const row = await handover();
      await testDb.db.update(employees).set({ locale }).where(eq(employees.id, employeeId));
      if (!row.acceptDeadlineAt) throw new Error('Expected deadline');
      await handleHandoverTimeout(testDb.db, {
        handoverId: row.id,
        fireAt: row.acceptDeadlineAt.toISOString(),
      });
      const [notice] = await testDb.db.select().from(notificationOutbox);
      expect(notice?.payload.text).toBe(messages(locale).handover.timeoutNotificationNoZone);
      expect(notice?.payload.text).not.toMatch(/undefined|null|\{zone\}/);
    },
  );
});
