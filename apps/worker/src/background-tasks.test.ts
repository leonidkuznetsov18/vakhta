import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  backgroundTasks,
  claimBackgroundTasks,
  domainEvents,
  employees,
  enqueueBackgroundTask,
  eq,
  shiftSessions,
  renewBackgroundTaskLease,
  retryBackgroundTask,
  runBackgroundTask,
  sql,
  type BackgroundTaskLease,
  type BackgroundTaskInput,
  type Transaction,
} from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../test/db.js';

describe('durable background task SQL invariants', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE background_tasks`);
  });

  const dueAt = new Date('2020-01-01T00:00:00Z');
  const claimOptions = { kinds: ['MEDIA_PROCESS'], limit: 1, leaseMs: 30_000 } as const;

  async function enqueueIntent(input: BackgroundTaskInput) {
    return testDb.db.transaction((tx) => enqueueBackgroundTask(tx, input));
  }

  it('requires a transaction at the enqueue boundary', () => {
    expectTypeOf<Parameters<typeof enqueueBackgroundTask>[0]>().toEqualTypeOf<Transaction>();
  });

  async function enqueue(key = randomUUID(), due = dueAt) {
    return enqueueIntent({
      kind: 'MEDIA_PROCESS',
      payloadVersion: 1,
      dedupeKey: key,
      payload: { mediaObjectId: key },
      dueAt: due,
    });
  }

  async function claim(): Promise<BackgroundTaskLease> {
    const [lease] = await claimBackgroundTasks(testDb.db, claimOptions);
    if (!lease) throw new Error('Expected one claimed task');
    return lease;
  }

  async function expire(lease: BackgroundTaskLease): Promise<void> {
    await testDb.db.execute(sql`
      UPDATE background_tasks SET lease_until = clock_timestamp() - interval '1 second'
      WHERE id = ${lease.id}
    `);
  }

  it('rejects a running task without an owner and lease deadline', async () => {
    await expect(
      testDb.db.execute(sql`
        INSERT INTO background_tasks (kind, dedupe_key, payload, due_at, available_at, status)
        VALUES ('MEDIA_PROCESS', ${randomUUID()}, '{}', clock_timestamp(), clock_timestamp(), 'RUNNING')
      `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('preserves the original intent even when raw SQL bypasses the enqueue helper', async () => {
    const id = randomUUID();
    await testDb.db.execute(sql`
      INSERT INTO background_tasks (id, kind, dedupe_key, payload, due_at, available_at)
      VALUES (${id}, 'MEDIA_PROCESS', ${randomUUID()}, '{"mediaObjectId":"original"}',
        clock_timestamp(), clock_timestamp())
    `);
    await expect(
      testDb.db.execute(sql`
        UPDATE background_tasks SET payload = '{"mediaObjectId":"replacement"}' WHERE id = ${id}
      `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
  it('rolls back the source event and its required task together', async () => {
    const eventId = randomUUID();
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(domainEvents).values({
          id: eventId,
          type: 'TEST_BACKGROUND_SOURCE',
          source: 'SYSTEM',
          occurredAt: dueAt,
        });
        await enqueueBackgroundTask(tx, {
          kind: 'MEDIA_PROCESS',
          payloadVersion: 1,
          dedupeKey: eventId,
          payload: { mediaObjectId: eventId },
          dueAt,
        });
        throw new Error('Injected source rollback');
      }),
    ).rejects.toThrow('Injected source rollback');
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(0);
    expect(
      await testDb.db.select().from(domainEvents).where(eq(domainEvents.id, eventId)),
    ).toHaveLength(0);
    await enqueue(eventId);
    expect((await claim()).dedupeKey).toBe(eventId);
  });

  it('deduplicates concurrent equal intents and rejects replacement payloads or deadlines', async () => {
    const key = randomUUID();
    const results = await Promise.all([enqueue(key), enqueue(key)]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    await expect(
      enqueueIntent({
        kind: 'MEDIA_PROCESS',
        payloadVersion: 1,
        dedupeKey: key,
        payload: { mediaObjectId: 'replacement' },
        dueAt,
      }),
    ).rejects.toThrow('Background task intent conflicts with its deduplication key');
    await expect(enqueue(key, new Date(dueAt.getTime() + 1))).rejects.toThrow(
      'Background task intent conflicts',
    );
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(1);
  });

  it('ignores operational fields carried by a structurally compatible intent object', async () => {
    const suppliedId = randomUUID();
    const input = {
      kind: 'MEDIA_PROCESS',
      payloadVersion: 1,
      dedupeKey: randomUUID(),
      payload: {},
      dueAt,
      id: suppliedId,
      status: 'COMPLETED',
      attempts: 7,
      completedAt: new Date(),
      createdAt: dueAt,
      lastErrorCode: 'EXECUTION_FAILED',
    } as const;
    const result = await enqueueIntent(input);
    const [row] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, result.id));
    expect(result.id).not.toBe(suppliedId);
    expect(row).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      completedAt: null,
      lastErrorCode: null,
    });
    expect((await claim()).id).toBe(result.id);
  });

  it('claims only due supported tasks and gives concurrent workers disjoint leases', async () => {
    const first = await enqueue();
    const second = await enqueue();
    await enqueue(randomUUID(), new Date('2100-01-01T00:00:00Z'));
    await enqueueIntent({
      kind: 'INCIDENT_SLA',
      payloadVersion: 1,
      dedupeKey: randomUUID(),
      payload: {},
      dueAt,
    });
    const batches = await Promise.all([
      claimBackgroundTasks(testDb.db, claimOptions),
      claimBackgroundTasks(testDb.db, claimOptions),
    ]);
    const leases = batches.flat();
    expect(leases).toHaveLength(2);
    expect(new Set(leases.map((lease) => lease.id))).toEqual(new Set([first.id, second.id]));
    expect(new Set(leases.map((lease) => lease.leaseToken)).size).toBe(2);
    expect(leases.every((lease) => lease.attempts === 1)).toBe(true);
    expect(await claimBackgroundTasks(testDb.db, claimOptions)).toHaveLength(0);
  });

  it('skips a row locked by another transaction instead of holding up unrelated work', async () => {
    const locked = await enqueue();
    const other = await enqueue();
    await testDb.db.transaction(async (tx) => {
      await tx
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, locked.id))
        .for('no key update');
      const leases = await claimBackgroundTasks(testDb.db, claimOptions);
      expect(leases.map((lease) => lease.id)).toEqual([other.id]);
    });
    expect((await claim()).id).toBe(locked.id);
  });

  it('rejects expired completion and renewal even before another worker reclaims the task', async () => {
    await enqueue();
    const lease = await claim();
    await expire(lease);
    let called = false;
    await expect(
      runBackgroundTask(testDb.db, lease, async () => {
        called = true;
      }),
    ).rejects.toThrow('Background task lease is no longer owned');
    expect(called).toBe(false);
    expect(await renewBackgroundTaskLease(testDb.db, lease, 30_000)).toBe(false);
    expect(
      await retryBackgroundTask(testDb.db, lease, { delayMs: 1000, errorCode: 'EXECUTION_FAILED' }),
    ).toBe(false);
  });

  it('fences an old worker after recovery and keeps the new owner intact', async () => {
    await enqueue();
    const old = await claim();
    await expire(old);
    const recovered = await claim();
    expect(recovered.id).toBe(old.id);
    expect(recovered.leaseToken).not.toBe(old.leaseToken);
    expect(recovered.attempts).toBe(2);
    expect(await renewBackgroundTaskLease(testDb.db, old, 30_000)).toBe(false);
    expect(
      await retryBackgroundTask(testDb.db, old, { delayMs: 1000, errorCode: 'EXECUTION_FAILED' }),
    ).toBe(false);
    await expect(runBackgroundTask(testDb.db, old, async () => 'obsolete')).rejects.toThrow(
      'Background task lease',
    );
    expect(await runBackgroundTask(testDb.db, recovered, async () => 'current')).toBe('current');
    const [row] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, old.id));
    expect(row).toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
      leaseToken: null,
      lastErrorCode: null,
    });
  });

  it('rolls back a partial business effect on failure and commits it with completion on retry', async () => {
    const key = randomUUID();
    await enqueue(key);
    const lease = await claim();
    const eventId = randomUUID();
    await expect(
      runBackgroundTask(testDb.db, lease, async (tx) => {
        await tx.insert(domainEvents).values({
          id: eventId,
          type: 'TEST_BACKGROUND_RESULT',
          source: 'SYSTEM',
          occurredAt: dueAt,
        });
        throw new Error('Injected handler failure');
      }),
    ).rejects.toThrow('Injected handler failure');
    expect(
      await testDb.db.select().from(domainEvents).where(eq(domainEvents.id, eventId)),
    ).toHaveLength(0);
    expect(
      await runBackgroundTask(testDb.db, lease, async (tx) => {
        await tx.insert(domainEvents).values({
          id: eventId,
          type: 'TEST_BACKGROUND_RESULT',
          source: 'SYSTEM',
          occurredAt: dueAt,
        });
        return eventId;
      }),
    ).toBe(eventId);
    expect(
      await testDb.db.select().from(domainEvents).where(eq(domainEvents.id, eventId)),
    ).toHaveLength(1);
    expect(await claimBackgroundTasks(testDb.db, claimOptions)).toHaveLength(0);
    expect((await enqueue(key)).created).toBe(false);
    await expect(runBackgroundTask(testDb.db, lease, async () => 'again')).rejects.toThrow(
      'Background task lease',
    );
  });

  it('checks the database wall clock again after effects and rolls back a lease that expires mid-transaction', async () => {
    await enqueue();
    const lease = await claim();
    const eventId = randomUUID();
    await expect(
      runBackgroundTask(testDb.db, lease, async (tx) => {
        await tx.insert(domainEvents).values({
          id: eventId,
          type: 'TEST_BACKGROUND_EXPIRED',
          source: 'SYSTEM',
          occurredAt: dueAt,
        });
        await tx.execute(
          sql`UPDATE background_tasks SET lease_until = clock_timestamp() + interval '25 milliseconds' WHERE id = ${lease.id}`,
        );
        await tx.execute(sql`SELECT pg_sleep(0.05)`);
      }),
    ).rejects.toThrow('Background task lease');
    expect(
      await testDb.db.select().from(domainEvents).where(eq(domainEvents.id, eventId)),
    ).toHaveLength(0);
    const [row] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id));
    expect(row?.status).toBe('RUNNING');
  });

  it('persists bounded retry metadata without changing intent and renews only the current owner', async () => {
    await enqueue();
    const lease = await claim();
    expect(await renewBackgroundTaskLease(testDb.db, lease, 60_000)).toBe(true);
    expect(
      await retryBackgroundTask(testDb.db, lease, {
        delayMs: 60_000,
        errorCode: 'DEPENDENCY_UNAVAILABLE',
      }),
    ).toBe(true);
    const [row] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id));
    expect(row).toMatchObject({
      payload: lease.payload,
      dueAt: lease.dueAt,
      status: 'PENDING',
      leaseToken: null,
      attempts: 1,
      lastErrorCode: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(await claimBackgroundTasks(testDb.db, claimOptions)).toHaveLength(0);
    expect(await renewBackgroundTaskLease(testDb.db, lease, 30_000)).toBe(false);
  });

  it('keeps every source-event and target pair instead of coalescing bonus invalidations', async () => {
    const employeeId = randomUUID();
    await testDb.db
      .insert(employees)
      .values({ id: employeeId, personnelNumber: randomUUID(), fullName: 'Task fixture' });
    const targetSessionId = randomUUID();
    const otherSessionId = randomUUID();
    await testDb.db.insert(shiftSessions).values(
      [targetSessionId, otherSessionId].map((id) => ({
        id,
        employeeId,
        businessDate: '2020-01-01',
        state: 'SHIFT_CLOSED' as const,
      })),
    );
    const sourceEventId = randomUUID();
    const secondSourceId = randomUUID();
    await testDb.db.insert(domainEvents).values(
      [sourceEventId, secondSourceId].map((id) => ({
        id,
        source: 'SYSTEM' as const,
        type: 'TEST_BONUS_INPUT',
        occurredAt: dueAt,
      })),
    );
    const input = {
      kind: 'BONUS_RECALCULATE',
      payloadVersion: 1,
      dedupeKey: randomUUID(),
      sourceEventId,
      targetSessionId,
      payload: {},
      dueAt,
    } as const;
    const first = await enqueueIntent(input);
    expect(await enqueueIntent(input)).toEqual({ id: first.id, created: false });
    await enqueueIntent({
      ...input,
      sourceEventId: secondSourceId,
      dedupeKey: randomUUID(),
    });
    await enqueueIntent({
      ...input,
      targetSessionId: otherSessionId,
      dedupeKey: randomUUID(),
    });
    await expect(enqueueIntent({ ...input, dedupeKey: randomUUID() })).rejects.toThrow(
      'Background task intent conflicts',
    );
    await expect(enqueueIntent({ ...input, targetSessionId: otherSessionId })).rejects.toThrow(
      'Background task intent conflicts',
    );
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(3);
    expect(
      await claimBackgroundTasks(testDb.db, {
        ...claimOptions,
        kinds: ['BONUS_RECALCULATE'],
        limit: 100,
      }),
    ).toHaveLength(3);
  });

  it.each([
    ['kind', "'UNKNOWN_KIND'"],
    ['payload_version', '0'],
    ['payload', "'[]'::jsonb"],
    ['dedupe_key', "''"],
    ['attempts', '-1'],
    ['available_at', "'1900-01-01'::timestamptz"],
    ['status', "'COMPLETED'"],
    ['kind', "'BONUS_RECALCULATE'"],
    ['source_event_id', 'gen_random_uuid()'],
  ])('enforces SQL invariants for invalid %s', async (column, expression) => {
    const id = randomUUID();
    const valid = {
      id: `'${id}'::uuid`,
      kind: "'MEDIA_PROCESS'",
      dedupe_key: `'${randomUUID()}'`,
      payload: "'{}'::jsonb",
      payload_version: '1',
      due_at: "'2020-01-01'::timestamptz",
      available_at: "'2020-01-01'::timestamptz",
      attempts: '0',
      status: "'PENDING'",
      source_event_id: 'NULL',
    };
    const entries = Object.entries(valid).map(([name, value]) => [
      name,
      name === column ? expression : value,
    ]);
    await expect(
      testDb.db.execute(sql`
      INSERT INTO background_tasks (${sql.raw(entries.map(([name]) => name).join(', '))})
      VALUES (${sql.raw(entries.map(([, value]) => value).join(', '))})
    `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('does not reopen completed tasks or replace their immutable metadata through SQL', async () => {
    await enqueue();
    const lease = await claim();
    await runBackgroundTask(testDb.db, lease, async () => undefined);
    await expect(
      testDb.db.execute(sql`
      UPDATE background_tasks SET status = 'PENDING', completed_at = NULL WHERE id = ${lease.id}
    `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      testDb.db.execute(sql`
      UPDATE background_tasks SET due_at = due_at - interval '1 second' WHERE id = ${lease.id}
    `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('bounds caller configuration and rejects unsafe persisted error text', async () => {
    for (const limit of [0, 101, 1.5, Number.NaN]) {
      await expect(claimBackgroundTasks(testDb.db, { ...claimOptions, limit })).rejects.toThrow(
        'Invalid background task',
      );
    }
    for (const leaseMs of [0, -1, 300_001, Number.POSITIVE_INFINITY]) {
      await expect(claimBackgroundTasks(testDb.db, { ...claimOptions, leaseMs })).rejects.toThrow(
        'Invalid background task',
      );
    }
    await enqueue();
    const lease = await claim();
    await expect(
      retryBackgroundTask(testDb.db, lease, { delayMs: 86_400_001, errorCode: 'EXECUTION_FAILED' }),
    ).rejects.toThrow('Invalid background task');
    await expect(
      testDb.db.execute(
        sql`UPDATE background_tasks SET last_error_code = 'https://secret.invalid/token' WHERE id = ${lease.id}`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
