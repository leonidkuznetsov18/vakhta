import { setImmediate } from 'node:timers/promises';
import { isSerializationFailure } from '../common/pg-errors.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  recoverBonusTasks,
  lockBonusMonthWithin,
  bonusMonthGuards,
  backgroundTasks,
  checklistDefinitions,
  domainEvents,
  employees,
  eq,
  handoverRecords,
  presenceSessions,
  requests,
  shiftSessions,
  sql,
} from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { EventStore } from '../events/event-store.js';

const NOW = new Date('2026-09-10T08:00:00Z');
const SYSTEM = { type: 'SYSTEM', id: null, role: 'SYSTEM' } as const;

describe('durable bonus source admission', () => {
  let fixture: TestDatabase;
  let sessionId: string;
  let employeeId: string;
  const events = new EventStore();
  beforeAll(async () => {
    fixture = await startTestDatabase();
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.db.execute(
      sql`TRUNCATE bonus_month_guards, background_tasks, shift_sessions, employees CASCADE`,
    );
    const [employee] = await fixture.db
      .insert(employees)
      .values({ personnelNumber: 'bonus-source', fullName: 'Bonus Source' })
      .returning();
    if (!employee) throw new Error('Missing employee fixture');
    employeeId = employee.id;
    const [session] = await fixture.db
      .insert(shiftSessions)
      .values({ employeeId: employee.id, businessDate: '2026-09-10', state: 'SHIFT_CLOSED' })
      .returning();
    if (!session) throw new Error('Missing session fixture');
    sessionId = session.id;
  });

  it('admits each original source identity and never recursively invalidates computed scores', async () => {
    const sources = await fixture.db.transaction(async (tx) => {
      const first = await events.append(tx, {
        type: 'SHIFT_CORRECTED',
        source: 'SYSTEM',
        actor: SYSTEM,
        occurredAt: NOW,
        shiftSessionId: sessionId,
      });
      const second = await events.append(tx, {
        type: 'SHIFT_SUMMARY_COMPUTED',
        source: 'SYSTEM',
        actor: SYSTEM,
        occurredAt: NOW,
        shiftSessionId: sessionId,
      });
      await events.append(tx, {
        type: 'BONUS_SCORE_COMPUTED',
        source: 'SYSTEM',
        actor: SYSTEM,
        occurredAt: NOW,
        shiftSessionId: sessionId,
      });
      return [first.id, second.id];
    });
    const rows = await fixture.db.select().from(backgroundTasks);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceEventId).sort()).toEqual(sources.sort());
    for (const row of rows)
      expect(row).toMatchObject({
        kind: 'BONUS_RECALCULATE',
        targetSessionId: sessionId,
        dueAt: NOW,
        payload: { sessionId },
      });
  });

  it('rolls back the source event and mutation when required bonus admission fails', async () => {
    await fixture.db.execute(
      sql`CREATE FUNCTION reject_bonus_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'BONUS_RECALCULATE' THEN RAISE EXCEPTION 'Injected bonus admission failure'; END IF; RETURN NEW; END $$`,
    );
    await fixture.db.execute(
      sql`CREATE TRIGGER reject_bonus_intent BEFORE INSERT ON background_tasks FOR EACH ROW EXECUTE FUNCTION reject_bonus_intent()`,
    );
    try {
      await expect(
        fixture.db.transaction(async (tx) => {
          await tx
            .update(shiftSessions)
            .set({ needsClarification: true })
            .where(eq(shiftSessions.id, sessionId));
          await events.append(tx, {
            type: 'SHIFT_FLAGGED_FOR_REVIEW',
            source: 'SYSTEM',
            actor: SYSTEM,
            shiftSessionId: sessionId,
          });
        }),
      ).rejects.toThrow();
      const [session] = await fixture.db
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, sessionId));
      expect(session?.needsClarification).toBe(false);
      expect(
        await fixture.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.shiftSessionId, sessionId)),
      ).toHaveLength(0);
    } finally {
      await fixture.db.execute(sql`DROP TRIGGER reject_bonus_intent ON background_tasks`);
      await fixture.db.execute(sql`DROP FUNCTION reject_bonus_intent()`);
    }
  });

  it('targets the report author rather than the reviewing shift', async () => {
    const [reviewer] = await fixture.db
      .insert(shiftSessions)
      .values({ employeeId, businessDate: '2026-09-11', state: 'SHIFT_CLOSED' })
      .returning();
    const [definition] = await fixture.db
      .insert(checklistDefinitions)
      .values({ version: 1, items: [] })
      .returning();
    if (!reviewer || !definition) throw new Error('Missing review fixture');
    const [report] = await fixture.db
      .insert(handoverRecords)
      .values({
        shiftSessionId: sessionId,
        submittedBy: employeeId,
        checklistDefinitionId: definition.id,
        status: 'ACCEPTED',
      })
      .returning();
    if (!report) throw new Error('Missing report fixture');
    await fixture.db.transaction((tx) =>
      events.append(tx, {
        type: 'HANDOVER_ACCEPTED',
        source: 'SYSTEM',
        actor: SYSTEM,
        shiftSessionId: reviewer.id,
        payload: { handoverId: report.id },
      }),
    );
    expect(
      await fixture.db.select({ target: backgroundTasks.targetSessionId }).from(backgroundTasks),
    ).toEqual([{ target: sessionId }]);
  });

  it('resolves a cancellation without direct session over the original employee date range', async () => {
    const [second] = await fixture.db
      .insert(shiftSessions)
      .values({ employeeId, businessDate: '2026-09-11', state: 'SHIFT_CLOSED' })
      .returning();
    const [request] = await fixture.db
      .insert(requests)
      .values({
        employeeId,
        type: 'VACATION',
        status: 'CANCELLED',
        periodFrom: '2026-09-10',
        periodTo: '2026-09-11',
        shiftSessionId: sessionId,
      })
      .returning();
    if (!request || !second) throw new Error('Missing request fixture');
    await fixture.db.transaction((tx) =>
      events.append(tx, {
        type: 'REQUEST_CANCELLED',
        source: 'SYSTEM',
        actor: SYSTEM,
        payload: { requestId: request.id },
      }),
    );
    const targets = await fixture.db
      .select({ id: backgroundTasks.targetSessionId })
      .from(backgroundTasks);
    expect(targets.map((row) => row.id).sort()).toEqual([sessionId, second.id].sort());
  });

  it('binds physical departure to the linked shift and ignores unrelated timer events', async () => {
    const [presence] = await fixture.db
      .insert(presenceSessions)
      .values({ employeeId, arrivedAt: NOW, arrivalMethod: 'WEB' })
      .returning();
    if (!presence) throw new Error('Missing presence fixture');
    await fixture.db
      .update(shiftSessions)
      .set({ presenceId: presence.id })
      .where(eq(shiftSessions.id, sessionId));
    await fixture.db.transaction(async (tx) => {
      await events.append(tx, {
        type: 'PRESENCE_DEPARTED',
        source: 'SYSTEM',
        actor: SYSTEM,
        payload: { presenceId: presence.id },
      });
      for (const type of ['DOWNTIME_ESCALATED', 'INCIDENT_SLA_BREACHED', 'HANDOVER_TIMEOUT'])
        await events.append(tx, {
          type,
          source: 'SYSTEM',
          actor: SYSTEM,
          shiftSessionId: sessionId,
        });
    });
    expect(
      await fixture.db.select({ target: backgroundTasks.targetSessionId }).from(backgroundTasks),
    ).toEqual([{ target: sessionId }]);
  });

  it('ignores deleted or malformed legacy parents without casting unsafe JSON to UUID', async () => {
    await fixture.db.transaction(async (tx) => {
      for (const [type, payload] of [
        ['HANDOVER_ACCEPTED', { handoverId: 'not-a-uuid' }],
        ['REQUEST_CANCELLED', { requestId: '00000000-0000-4000-8000-000000000000' }],
        ['BONUS_PERIOD_REOPENED', { periodId: 'deleted' }],
      ] as const)
        await events.append(tx, {
          type,
          source: 'SYSTEM',
          actor: SYSTEM,
          shiftSessionId: sessionId,
          payload,
        });
    });
    expect(await fixture.db.select().from(backgroundTasks)).toHaveLength(0);
  });

  for (const existing of [true, false])
    it(`restarts a waited RR snapshot with an ${existing ? 'existing' : 'absent'} month guard`, async () => {
      if (existing) await fixture.db.transaction((tx) => lockBonusMonthWithin(tx, '2026-09'));
      let releaseWriter = () => {};
      const held = new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      let writerReady = () => {};
      const ready = new Promise<void>((resolve) => {
        writerReady = resolve;
      });
      let readerPid = 0;
      const writer = fixture.db.transaction(async (tx) => {
        await lockBonusMonthWithin(tx, '2026-09');
        await tx
          .update(shiftSessions)
          .set({ needsClarification: true })
          .where(eq(shiftSessions.id, sessionId));
        writerReady();
        await held;
      });
      await ready;
      const reader = fixture.db
        .transaction(
          async (tx) => {
            const [pid] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
            if (!pid) throw new Error('Missing backend PID');
            readerPid = pid.pid;
            await lockBonusMonthWithin(tx, '2026-09');
          },
          { isolationLevel: 'repeatable read' },
        )
        .then(
          () => null,
          (error) => error as unknown,
        );
      try {
        let blocked = false;
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const [state] = await fixture.db.execute<{ waiting: boolean }>(
            sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = ${readerPid}`,
          );
          if (state?.waiting) {
            blocked = true;
            break;
          }
          await setImmediate();
        }
        expect(blocked).toBe(true);
        releaseWriter();
        await writer;
        expect(isSerializationFailure(await reader)).toBe(true);
        await fixture.db.transaction(
          async (tx) => {
            await lockBonusMonthWithin(tx, '2026-09');
            const [row] = await tx
              .select()
              .from(shiftSessions)
              .where(eq(shiftSessions.id, sessionId));
            expect(row?.needsClarification).toBe(true);
          },
          { isolationLevel: 'repeatable read' },
        );
        const [guard] = await fixture.db.select().from(bonusMonthGuards);
        expect(guard?.revision).toBe(existing ? 3n : 2n);
      } finally {
        releaseWriter();
        await Promise.allSettled([writer, reader]);
      }
    });

  it('admits a source while its month guard is held by a scoring transaction', async () => {
    let release = () => {};
    let signal = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const writer = fixture.db.transaction(async (tx) => {
      await lockBonusMonthWithin(tx, '2026-09');
      signal();
      await held;
    });
    await ready;
    try {
      await fixture.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '1000ms'`);
        await events.append(tx, {
          type: 'SHIFT_CORRECTED',
          source: 'SYSTEM',
          actor: SYSTEM,
          shiftSessionId: sessionId,
        });
      });
      expect(await fixture.db.select().from(backgroundTasks)).toHaveLength(1);
    } finally {
      release();
      await writer;
    }
  });

  it('recovers real source pairs before limiting, without coalescing or irrelevant-event starvation', async () => {
    await fixture.db
      .insert(domainEvents)
      .values(
        Array.from({ length: 110 }, () => ({
          type: 'BONUS_SCORE_COMPUTED',
          source: 'SYSTEM' as const,
          occurredAt: NOW,
          shiftSessionId: sessionId,
        })),
      );
    const sources = await fixture.db
      .insert(domainEvents)
      .values(
        ['SHIFT_CORRECTED', 'SHIFT_SUMMARY_COMPUTED'].map((type) => ({
          type,
          source: 'SYSTEM' as const,
          occurredAt: NOW,
          shiftSessionId: sessionId,
        })),
      )
      .returning();
    for (let index = 0; index < 2; index += 1)
      expect(await fixture.db.transaction((tx) => recoverBonusTasks(tx, 1))).toMatchObject({
        admitted: 1,
        markers: 0,
      });
    expect(await fixture.db.transaction((tx) => recoverBonusTasks(tx, 1))).toMatchObject({
      admitted: 0,
      markers: 0,
    });
    const tasks = await fixture.db.select().from(backgroundTasks);
    expect(tasks.map((task) => task.sourceEventId).sort()).toEqual(
      sources.map((source) => source.id).sort(),
    );
  });

  it('creates one audited stable marker only when no real source exists, atomically with its intent', async () => {
    await fixture.db.execute(
      sql`CREATE FUNCTION reject_recovery_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected recovery failure'; END $$`,
    );
    await fixture.db.execute(
      sql`CREATE TRIGGER reject_recovery_intent BEFORE INSERT ON background_tasks FOR EACH ROW EXECUTE FUNCTION reject_recovery_intent()`,
    );
    try {
      await expect(fixture.db.transaction((tx) => recoverBonusTasks(tx))).rejects.toThrow();
      expect(
        await fixture.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.shiftSessionId, sessionId)),
      ).toHaveLength(0);
    } finally {
      await fixture.db.execute(sql`DROP TRIGGER reject_recovery_intent ON background_tasks`);
      await fixture.db.execute(sql`DROP FUNCTION reject_recovery_intent()`);
    }
    expect(await fixture.db.transaction((tx) => recoverBonusTasks(tx))).toMatchObject({
      markers: 1,
      admitted: 1,
    });
    expect(await fixture.db.transaction((tx) => recoverBonusTasks(tx))).toMatchObject({
      markers: 0,
      admitted: 0,
    });
    const rows = await fixture.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    expect(rows).toMatchObject([
      { type: 'BONUS_RECALCULATION_RECOVERED', idempotencyKey: `bonus-recovery:${sessionId}` },
    ]);
    const audit = await fixture.db.execute(
      sql`select id from audit_log where object_id = ${sessionId} and action = 'bonus.recover'`,
    );
    expect(audit).toHaveLength(1);
  });

  it('provides a checked month guard shared across sites', async () => {
    await fixture.db.execute(
      sql`INSERT INTO bonus_month_guards(month, revision) VALUES ('2026-09', 1)`,
    );
    await expect(
      fixture.db.execute(
        sql`INSERT INTO bonus_month_guards(month, revision) VALUES ('2026-13', 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      fixture.db.execute(
        sql`INSERT INTO bonus_month_guards(month, revision) VALUES ('2026-09', 2)`,
      ),
    ).rejects.toThrow();
  });
});
