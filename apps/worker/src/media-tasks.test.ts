import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backgroundTasks,
  checklistDefinitions,
  claimBackgroundTasks,
  domainEvents,
  employees,
  handoverMedia,
  handoverRecords,
  shiftSessions,
  enqueueBackgroundTask,
  enqueueMediaProcessing,
  eq,
  mediaObjects,
  sql,
} from '@vakhta/db';
import { DEFAULT_QUALITY_THRESHOLDS } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { InMemoryMediaStore } from './media/adapters.js';
import { processMedia } from './media/process.js';
import { dispatchMediaTasks, recoverMediaTasks } from './media/tasks.js';
import { MediaTaskRunner } from './media/runner.js';

const receivedAt = new Date('2020-01-01T00:00:00Z');
const options = { batch: 2, leaseMs: 120_000, ioTimeoutMs: 60_000, retryMs: 1000 };

describe('durable media processing survives admission and worker failures', () => {
  let testDb: TestDatabase;
  let store: InMemoryMediaStore;
  function deps() {
    return {
      fetcher: {
        async fetch() {
          return { buffer: Buffer.from('test evidence'), contentType: 'image/jpeg' };
        },
      },
      store,
      options: { thresholds: DEFAULT_QUALITY_THRESHOLDS, retentionDays: 365 },
    };
  }
  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE background_tasks, media_objects CASCADE`);
    store = new InMemoryMediaStore();
  });
  async function media(admit = true) {
    const id = randomUUID();
    await testDb.db.transaction(async (tx) => {
      await tx.insert(mediaObjects).values({
        id,
        telegramFileId: 'file',
        telegramFileUniqueId: id,
        purpose: 'handover',
        receivedAt,
      });
      if (admit) await enqueueMediaProcessing(tx, { id, receivedAt });
    });
    return id;
  }
  async function row(id: string) {
    const [value] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    return value;
  }
  async function events(id: string) {
    return testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, `media-processed:${id}`));
  }

  it('recovers legacy admission repeatedly and reclaims a process that died after claiming', async () => {
    const id = await media(false);
    await recoverMediaTasks(testDb.db, 10);
    await recoverMediaTasks(testDb.db, 10);
    const [abandoned] = await claimBackgroundTasks(testDb.db, {
      kinds: ['MEDIA_PROCESS'],
      limit: 1,
      leaseMs: 30_000,
    });
    if (!abandoned) throw new Error('Expected recoverable task');
    await testDb.db.execute(
      sql`UPDATE background_tasks SET lease_until = clock_timestamp() - interval '1 second' WHERE id = ${abandoned.id}`,
    );
    expect(await dispatchMediaTasks(testDb.db, deps(), options)).toMatchObject({ completed: 1 });
    expect(await row(id)).toMatchObject({ quality: 'CORRUPT', lastError: null });
    expect(await events(id)).toHaveLength(1);
    expect(await testDb.db.select().from(backgroundTasks)).toMatchObject([
      { id: abandoned.id, status: 'COMPLETED', attempts: 2, dueAt: receivedAt },
    ]);
    await recoverMediaTasks(testDb.db, 10);
    expect(await dispatchMediaTasks(testDb.db, deps(), options)).toMatchObject({ claimed: 0 });
  });

  it('keeps media pending and task retryable when credentials are missing', async () => {
    const id = await media();
    expect(await dispatchMediaTasks(testDb.db, null, options)).toMatchObject({
      retried: 1,
      completed: 0,
    });
    expect(await row(id)).toMatchObject({ processedAt: null, storageKey: null });
    expect(await testDb.db.select().from(backgroundTasks)).toMatchObject([
      { status: 'PENDING', lastErrorCode: 'DEPENDENCY_UNAVAILABLE' },
    ]);
    expect(await events(id)).toHaveLength(0);
  });

  it('deduplicates overlapping legacy BullMQ and durable PostgreSQL attempts', async () => {
    const id = await media();
    await Promise.all([
      processMedia(testDb.db, deps(), { mediaObjectId: id }),
      dispatchMediaTasks(testDb.db, deps(), options),
    ]);
    expect(await events(id)).toHaveLength(1);
    expect(await row(id)).toMatchObject({ attempts: 1, lastError: null });
    expect(await testDb.db.select().from(backgroundTasks)).toMatchObject([{ status: 'COMPLETED' }]);
    expect(store.objects.size).toBe(1);
  });

  it('fences projection writes when a lease expires during external I/O', async () => {
    const id = await media();
    const normal = deps();
    const delayed = {
      ...normal,
      fetcher: {
        async fetch() {
          await testDb.db.execute(
            sql`UPDATE background_tasks SET lease_until = clock_timestamp() - interval '1 second' WHERE status = 'RUNNING'`,
          );
          return normal.fetcher.fetch();
        },
      },
    };
    expect(await dispatchMediaTasks(testDb.db, delayed, options)).toMatchObject({
      lost: 1,
      completed: 0,
    });
    expect(await row(id)).toMatchObject({ processedAt: null, storageKey: null, attempts: 0 });
    expect(await events(id)).toHaveLength(0);
    expect(await dispatchMediaTasks(testDb.db, normal, options)).toMatchObject({ completed: 1 });
  });

  it('repairs an already processed legacy row without more network I/O and preserves processing time', async () => {
    const id = await media(false);
    const processedAt = new Date('2020-01-02T00:00:00Z');
    await testDb.db
      .update(mediaObjects)
      .set({ storageKey: `legacy/${id}.jpg`, processedAt, quality: 'OK', attempts: 3 })
      .where(eq(mediaObjects.id, id));
    await recoverMediaTasks(testDb.db, 10);
    const noIo = {
      ...deps(),
      fetcher: {
        async fetch(): Promise<never> {
          throw new Error('Repair must not fetch');
        },
      },
    };
    expect(await dispatchMediaTasks(testDb.db, noIo, options)).toMatchObject({ completed: 1 });
    const [originalEvent] = await events(id);
    expect(originalEvent).toMatchObject({ occurredAt: processedAt });
    expect(await row(id)).toMatchObject({
      storageKey: `legacy/${id}.jpg`,
      processedAt,
      attempts: 3,
    });
    await recoverMediaTasks(testDb.db, 10);
    expect(await events(id)).toEqual([originalEvent]);
  });

  it('times out the whole preparation and prevents a late fetch from uploading or writing a projection', async () => {
    const id = await media();
    let release: () => void = () => {
      throw new Error('Gate not initialized');
    };
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const normal = deps();
    const delayed = {
      ...normal,
      fetcher: {
        async fetch() {
          await blocked;
          return normal.fetcher.fetch();
        },
      },
    };
    expect(
      await dispatchMediaTasks(testDb.db, delayed, { ...options, ioTimeoutMs: 20 }),
    ).toMatchObject({ retried: 1, completed: 0 });
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(store.objects.size).toBe(0);
    expect(await row(id)).toMatchObject({ processedAt: null, storageKey: null, attempts: 0 });
    expect(await events(id)).toHaveLength(0);
  });

  it('commits media, its event, bonus invalidation and task completion together, then repairs the same event target', async () => {
    const id = await media();
    const employeeId = randomUUID();
    const sessionId = randomUUID();
    const definitionId = randomUUID();
    const handoverId = randomUUID();
    await testDb.db
      .insert(employees)
      .values({ id: employeeId, personnelNumber: randomUUID(), fullName: 'Media bonus fixture' });
    await testDb.db
      .insert(shiftSessions)
      .values({ id: sessionId, employeeId, businessDate: '2020-01-01', state: 'SHIFT_CLOSED' });
    await testDb.db
      .insert(checklistDefinitions)
      .values({ id: definitionId, name: 'Photo fixture', version: 1, items: [] });
    await testDb.db.insert(handoverRecords).values({
      id: handoverId,
      shiftSessionId: sessionId,
      submittedBy: employeeId,
      checklistDefinitionId: definitionId,
      status: 'SUBMITTED',
    });
    await testDb.db
      .insert(handoverMedia)
      .values({ handoverId, itemKey: 'PHOTO', mediaObjectId: id });
    await testDb.db.execute(
      sql`CREATE FUNCTION public.test_reject_media_bonus() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected media bonus admission failure'; END $$`,
    );
    try {
      await testDb.db.execute(
        sql`CREATE TRIGGER test_reject_media_bonus BEFORE INSERT ON public.background_tasks FOR EACH ROW WHEN (NEW.kind = 'BONUS_RECALCULATE') EXECUTE FUNCTION public.test_reject_media_bonus()`,
      );
      expect(await dispatchMediaTasks(testDb.db, deps(), options)).toMatchObject({
        retried: 1,
        completed: 0,
      });
    } finally {
      await testDb.db.execute(
        sql`DROP TRIGGER IF EXISTS test_reject_media_bonus ON public.background_tasks`,
      );
      await testDb.db.execute(sql`DROP FUNCTION public.test_reject_media_bonus()`);
    }
    expect(await row(id)).toMatchObject({ processedAt: null, storageKey: null, attempts: 0 });
    expect(await events(id)).toHaveLength(0);
    await testDb.db.execute(
      sql`UPDATE background_tasks SET available_at = due_at WHERE kind = 'MEDIA_PROCESS'`,
    );
    expect(await dispatchMediaTasks(testDb.db, deps(), options)).toMatchObject({ completed: 1 });
    const [event] = await events(id);
    if (!event) throw new Error('Expected committed media event');
    const [bonus] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'BONUS_RECALCULATE'));
    expect(bonus).toMatchObject({
      sourceEventId: event.id,
      targetSessionId: sessionId,
      payload: { sessionId },
      dueAt: event.occurredAt,
    });
    expect(store.objects.size).toBe(1);
    await testDb.db.delete(backgroundTasks).where(eq(backgroundTasks.kind, 'BONUS_RECALCULATE'));
    expect(await recoverMediaTasks(testDb.db, 10)).toMatchObject({ admitted: 0, bonusQueued: 1 });
    expect(await recoverMediaTasks(testDb.db, 10)).toMatchObject({ admitted: 0, bonusQueued: 0 });
    expect(await events(id)).toEqual([event]);
    const [repaired] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.kind, 'BONUS_RECALCULATE'));
    expect(repaired).toMatchObject({
      sourceEventId: event.id,
      targetSessionId: sessionId,
      dueAt: event.occurredAt,
      dedupeKey: bonus?.dedupeKey,
    });
  });

  it('runs startup recovery immediately and waits for its in-flight batch during shutdown', async () => {
    const id = await media(false);
    let admitted = 0;
    let completed = 0;
    const failures: string[] = [];
    const runner = new MediaTaskRunner(testDb.db, deps(), {
      recovered(result) {
        admitted += result.admitted;
      },
      completed(result) {
        completed += result.completed;
      },
      failed(stage) {
        failures.push(stage);
      },
    });
    runner.start();
    runner.start();
    await runner.stop();
    expect({ admitted, completed, failures }).toEqual({ admitted: 1, completed: 1, failures: [] });
    expect(await events(id)).toHaveLength(1);
  });

  it('bounds recovery batches while finding later commits with old receipt times', async () => {
    await media(false);
    await media(false);
    await media(false);
    expect(await recoverMediaTasks(testDb.db, 2)).toMatchObject({ admitted: 2 });
    expect(await recoverMediaTasks(testDb.db, 2)).toMatchObject({ admitted: 1 });
    expect(await recoverMediaTasks(testDb.db, 2)).toMatchObject({ admitted: 0 });
    await media(false);
    expect(await recoverMediaTasks(testDb.db, 2)).toMatchObject({ admitted: 1 });
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(4);
  });

  it('does not acknowledge unsupported versions or malformed payloads', async () => {
    await testDb.db.transaction(async (tx) => {
      await enqueueBackgroundTask(tx, {
        kind: 'MEDIA_PROCESS',
        payloadVersion: 2,
        dedupeKey: randomUUID(),
        payload: { mediaObjectId: randomUUID() },
        dueAt: receivedAt,
      });
      await enqueueBackgroundTask(tx, {
        kind: 'MEDIA_PROCESS',
        payloadVersion: 1,
        dedupeKey: randomUUID(),
        payload: { mediaObjectId: 'invalid' },
        dueAt: receivedAt,
      });
    });
    expect(await dispatchMediaTasks(testDb.db, deps(), options)).toMatchObject({
      retried: 2,
      completed: 0,
    });
    const tasks = await testDb.db.select().from(backgroundTasks);
    expect(new Set(tasks.map((task) => task.lastErrorCode))).toEqual(
      new Set(['UNSUPPORTED_VERSION', 'INVALID_PAYLOAD']),
    );
    expect(tasks.every((task) => task.status === 'PENDING')).toBe(true);
  });
});
