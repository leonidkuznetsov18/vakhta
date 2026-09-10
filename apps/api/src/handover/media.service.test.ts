import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { backgroundTasks, employees, eq, mediaObjects, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AuditLog } from '../events/audit-log.js';
import { MediaService } from './media.service.js';

const receivedAt = new Date('2026-08-31T23:58:00Z');

describe('media admission persists required work with its source transaction', () => {
  let testDb: TestDatabase;
  let service: MediaService;
  let employeeId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new MediaService(testDb.db, new AuditLog(), { linkTtlSeconds: 300 });
  }, 180_000);
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE background_tasks, media_objects, employees CASCADE`);
    employeeId = randomUUID();
    await testDb.db.insert(employees).values({
      id: employeeId,
      personnelNumber: randomUUID(),
      fullName: 'Media admission fixture',
    });
  });

  function input(now = receivedAt) {
    return {
      telegramFileId: 'file',
      telegramFileUniqueId: 'unique-file',
      uploadedBy: employeeId,
      purpose: 'handover',
      now,
    };
  }

  it('makes a committed upload discoverable without an after-commit callback and keeps its original deadline on replay', async () => {
    const row = await testDb.db.transaction(async (tx) => {
      const media = await service.register(tx, input());
      expect(await tx.select().from(backgroundTasks)).toHaveLength(1);
      return media;
    });
    expect(
      await testDb.db.transaction((tx) =>
        service.register(tx, input(new Date('2026-09-01T00:01:00Z'))),
      ),
    ).toMatchObject({ id: row.id });
    const [task] = await testDb.db.select().from(backgroundTasks);
    expect(task).toMatchObject({
      kind: 'MEDIA_PROCESS',
      payloadVersion: 1,
      payload: { mediaObjectId: row.id },
      dueAt: receivedAt,
      status: 'PENDING',
    });
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(1);
  });

  it('replays an already processed attachment without changing its task identity or receipt time', async () => {
    const original = await testDb.db.transaction((tx) => service.register(tx, input()));
    await testDb.db
      .update(mediaObjects)
      .set({ storageKey: 'legacy/object.jpg', processedAt: receivedAt, quality: 'OK' })
      .where(eq(mediaObjects.id, original.id));
    const [task] = await testDb.db.select().from(backgroundTasks);
    const repeated = await testDb.db.transaction((tx) =>
      service.register(tx, input(new Date('2026-09-01T00:01:00Z'))),
    );
    expect(repeated).toMatchObject({
      id: original.id,
      receivedAt,
      processedAt: receivedAt,
      storageKey: 'legacy/object.jpg',
    });
    expect(await testDb.db.select().from(backgroundTasks)).toEqual([task]);
  });

  it('rolls back media and task when the enclosing handover/request/incident operation fails', async () => {
    await expect(
      testDb.db.transaction(async (tx) => {
        await service.register(tx, input());
        throw new Error('Injected source failure');
      }),
    ).rejects.toThrow('Injected source failure');
    expect(await testDb.db.select().from(mediaObjects)).toHaveLength(0);
    expect(await testDb.db.select().from(backgroundTasks)).toHaveLength(0);
  });

  it('recreates admission for an existing unprocessed legacy row using its original receipt time', async () => {
    const id = randomUUID();
    await testDb.db.insert(mediaObjects).values({
      id,
      telegramFileId: 'file',
      telegramFileUniqueId: 'unique-file',
      uploadedBy: employeeId,
      purpose: 'handover',
      receivedAt,
    });
    expect(
      await testDb.db.transaction((tx) =>
        service.register(tx, input(new Date('2026-09-01T00:01:00Z'))),
      ),
    ).toMatchObject({ id });
    const [task] = await testDb.db.select().from(backgroundTasks);
    expect(task).toMatchObject({ payload: { mediaObjectId: id }, dueAt: receivedAt });
    const [row] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(row?.receivedAt).toEqual(receivedAt);
  });
});
