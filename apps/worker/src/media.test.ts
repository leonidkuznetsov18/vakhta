import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { domainEvents, employees, eq, mediaObjects, sql } from '@vakhta/db';
import { DEFAULT_QUALITY_THRESHOLDS } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { InMemoryMediaStore } from './media/adapters.js';
import { processMedia, type FileFetcher } from './media/process.js';

/** Широкий спектр, як у природних фото: pHash стабільний до перекодування і зсуву яскравості. */
const COMPONENTS = Array.from({ length: 48 }, (_, k) => ({
  a: 70 / Math.sqrt(k + 1),
  fx: 6 + ((k * 37) % 90),
  fy: 5 + ((k * 53) % 70),
  px: (k * 1.7) % 6.28,
  py: (k * 2.3) % 6.28,
}));

function pattern(x: number, y: number, shade: number): number {
  let v = shade;
  for (const c of COMPONENTS) v += c.a * Math.sin(x / c.fx + c.px) * Math.cos(y / c.fy + c.py);
  return v;
}

async function jpeg(width: number, height: number, shade: number, quality = 85): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const v = Math.max(
      0,
      Math.min(255, Math.round(pattern(i % width, Math.floor(i / width), shade))),
    );
    raw[i * 3] = v;
    raw[i * 3 + 1] = v;
    raw[i * 3 + 2] = v;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
}

class FakeFetcher implements FileFetcher {
  readonly files = new Map<string, Buffer>();
  async fetch(fileId: string): Promise<{ buffer: Buffer; contentType: string | null }> {
    const buffer = this.files.get(fileId);
    if (!buffer) throw new Error(`немає файлу ${fileId}`);
    return { buffer, contentType: 'image/jpeg' };
  }
}

describe('worker: фото-пайплайн (ADR-0006, FR-PHO-02/03, T-24..T-26)', () => {
  let testDb: TestDatabase;
  let employeeId: string;
  const fetcher = new FakeFetcher();
  const store = new InMemoryMediaStore();
  const deps = {
    fetcher,
    store,
    options: { thresholds: DEFAULT_QUALITY_THRESHOLDS, retentionDays: 365 },
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE media_objects, employees CASCADE`);
    const [emp] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Иванов Иван' })
      .returning();
    employeeId = emp!.id;
    fetcher.files.clear();
    store.objects.clear();
  });

  async function media(fileId: string, receivedAt = new Date()): Promise<string> {
    const [row] = await testDb.db
      .insert(mediaObjects)
      .values({
        telegramFileId: fileId,
        telegramFileUniqueId: `u-${fileId}`,
        uploadedBy: employeeId,
        purpose: 'handover',
        receivedAt,
      })
      .returning();
    return row!.id;
  }

  it('переносить у сховище, рахує SHA-256, pHash, яскравість і ставить OK; повтор job нічого не робить', async () => {
    fetcher.files.set('good', await jpeg(1280, 960, 128));
    const id = await media('good');
    expect(await processMedia(testDb.db, deps, { mediaObjectId: id })).toBe('processed');
    expect(await processMedia(testDb.db, deps, { mediaObjectId: id })).toBe('stale');
    const [row] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(row).toMatchObject({
      quality: 'OK',
      width: 1280,
      height: 960,
      contentType: 'image/jpeg',
    });
    expect(row?.sha256).toHaveLength(64);
    expect(row?.phash).toHaveLength(16);
    expect(row?.brightness).toBeGreaterThan(100);
    expect(row?.storageKey).toMatch(/^handover\/\d{4}-\d{2}\/.+\.jpg$/);
    expect(store.objects.has(row!.storageKey!)).toBe(true);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, employeeId));
    expect(events.map((e) => e.type)).toEqual(['MEDIA_PROCESSED']);
  });

  it('T-24: низька роздільність і темне фото позначаються, але зберігаються', async () => {
    fetcher.files.set('small', await jpeg(320, 240, 128));
    fetcher.files.set('dark', await jpeg(1280, 960, -60));
    const small = await media('small');
    const dark = await media('dark');
    await processMedia(testDb.db, deps, { mediaObjectId: small });
    await processMedia(testDb.db, deps, { mediaObjectId: dark });
    const rows = await testDb.db.select().from(mediaObjects);
    expect(rows.find((r) => r.id === small)?.quality).toBe('LOW_RES');
    expect(rows.find((r) => r.id === dark)?.quality).toBe('DARK');
    expect(rows.every((r) => r.storageKey !== null)).toBe(true);
  });

  it('T-25/T-26: точний і близький повтор позначаються підозрою без автоштрафу; пошкоджений файл → CORRUPT', async () => {
    const original = await jpeg(1280, 960, 128);
    fetcher.files.set('a', original);
    fetcher.files.set('b', original);
    // те саме фото, перекодоване з іншою якістю і трохи світліше: ймовірний повтор
    fetcher.files.set('c', await jpeg(1280, 960, 134, 60));
    fetcher.files.set('broken', Buffer.from('not an image'));
    const a = await media('a');
    const b = await media('b');
    const c = await media('c');
    const broken = await media('broken');
    await processMedia(testDb.db, deps, { mediaObjectId: a });
    await processMedia(testDb.db, deps, { mediaObjectId: b });
    await processMedia(testDb.db, deps, { mediaObjectId: c });
    await processMedia(testDb.db, deps, { mediaObjectId: broken });
    const rows = await testDb.db.select().from(mediaObjects);
    expect(rows.find((r) => r.id === a)?.quality).toBe('OK');
    expect(rows.find((r) => r.id === b)).toMatchObject({
      quality: 'DUPLICATE_SUSPECT',
      duplicateOfId: a,
    });
    expect(rows.find((r) => r.id === c)?.quality).toBe('DUPLICATE_SUSPECT');
    expect(rows.find((r) => r.id === broken)?.quality).toBe('CORRUPT');
  });

  it('помилка завантаження збільшує attempts і кидає далі для повтору BullMQ', async () => {
    const id = await media('missing-file');
    await expect(processMedia(testDb.db, deps, { mediaObjectId: id })).rejects.toThrow();
    const [row] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain('missing-file');
    expect(row?.processedAt).toBeNull();
  });

  it('rolls back the media projection when its event fails, then commits both on retry', async () => {
    const receivedAt = new Date('2026-08-31T23:58:00.000Z');
    let now = new Date('2026-08-31T23:59:00.000Z');
    fetcher.files.set('event-failure', await jpeg(1280, 960, 128));
    const id = await media('event-failure', receivedAt);
    const job = { mediaObjectId: id };
    const timedDeps = { ...deps, options: { ...deps.options, now: () => now } };
    const key = `handover/2026-08/${id}.jpg`;

    await testDb.db.execute(sql`
      CREATE FUNCTION public.test_reject_media_processed() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Injected media event failure';
      END;
      $$
    `);
    try {
      await testDb.db.execute(sql`
        CREATE TRIGGER test_reject_media_processed
        BEFORE INSERT ON public.domain_events
        FOR EACH ROW WHEN (NEW.type = 'MEDIA_PROCESSED')
        EXECUTE FUNCTION public.test_reject_media_processed()
      `);
      await expect(processMedia(testDb.db, timedDeps, job)).rejects.toMatchObject({
        cause: { message: 'Injected media event failure', code: 'P0001' },
      });
    } finally {
      await testDb.db.execute(sql`
        DROP TRIGGER IF EXISTS test_reject_media_processed ON public.domain_events
      `);
      await testDb.db.execute(sql`DROP FUNCTION public.test_reject_media_processed()`);
    }

    const [failed] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(failed).toMatchObject({
      storageKey: null,
      processedAt: null,
      contentType: null,
      sizeBytes: null,
      width: null,
      height: null,
      sha256: null,
      phash: null,
      brightness: null,
      quality: 'PENDING',
      qualityNotes: null,
      duplicateOfId: null,
      retentionUntil: null,
      attempts: 1,
    });
    expect(failed?.lastError).toBeTruthy();
    expect(
      await testDb.db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.idempotencyKey, `media-processed:${id}`)),
    ).toHaveLength(0);
    // S3 cannot roll back with PostgreSQL: the retry must reuse its already uploaded object.
    expect([...store.objects.keys()]).toEqual([key]);

    now = new Date('2026-09-01T00:01:00.000Z');
    expect(await processMedia(testDb.db, timedDeps, job)).toBe('processed');
    const [completed] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(completed).toMatchObject({
      storageKey: key,
      processedAt: now,
      quality: 'OK',
      attempts: 2,
      lastError: null,
    });
    expect([...store.objects.keys()]).toEqual([key]);
    expect(await processMedia(testDb.db, timedDeps, job)).toBe('stale');
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, `media-processed:${id}`));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'MEDIA_PROCESSED',
      occurredAt: now,
      employeeId,
      payload: { mediaObjectId: id, quality: 'OK', width: 1280, height: 960 },
    });
  });

  it('reuses the received-month storage key after an upload acknowledgement is lost', async () => {
    const receivedAt = new Date('2026-08-31T23:58:00.000Z');
    let now = new Date('2026-08-31T23:59:00.000Z');
    let loseAcknowledgement = true;
    fetcher.files.set('upload-retry', await jpeg(320, 240, 128));
    const id = await media('upload-retry', receivedAt);
    const job = { mediaObjectId: id };
    const retryDeps = {
      ...deps,
      options: { ...deps.options, now: () => now },
      store: {
        async put(key: string, body: Buffer, contentType: string): Promise<void> {
          await store.put(key, body, contentType);
          if (loseAcknowledgement) {
            loseAcknowledgement = false;
            throw new Error('Injected lost upload acknowledgement');
          }
        },
      },
    };
    await expect(processMedia(testDb.db, retryDeps, job)).rejects.toThrow(
      'Injected lost upload acknowledgement',
    );
    const key = `handover/2026-08/${id}.jpg`;
    expect([...store.objects.keys()]).toEqual([key]);

    now = new Date('2026-09-01T00:01:00.000Z');
    expect(await processMedia(testDb.db, retryDeps, job)).toBe('processed');
    expect([...store.objects.keys()]).toEqual([key]);
    const [completed] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(completed).toMatchObject({ storageKey: key, processedAt: now, lastError: null });
  });

  it('repairs a legacy processed row missing its event without fetching or uploading again', async () => {
    const receivedAt = new Date('2026-08-31T23:58:00.000Z');
    const processedAt = new Date('2026-08-31T23:59:00.000Z');
    const id = await media('legacy-processed', receivedAt);
    const duplicateOfId = await media('legacy-original', receivedAt);
    const [original] = await testDb.db
      .update(mediaObjects)
      .set({
        storageKey: `handover/2026-08/${id}.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        width: 1280,
        height: 960,
        sha256: 'a'.repeat(64),
        phash: 'b'.repeat(16),
        brightness: 128,
        quality: 'DUPLICATE_SUSPECT',
        qualityNotes: 'Exact duplicate',
        duplicateOfId,
        processedAt,
        retentionUntil: new Date('2027-08-31T23:59:00.000Z'),
        attempts: 2,
        lastError: 'Previous event insertion failed',
      })
      .where(eq(mediaObjects.id, id))
      .returning();
    const repairDeps = {
      options: { ...deps.options, now: () => new Date('2026-09-01T00:01:00.000Z') },
      fetcher: {
        async fetch(): Promise<never> {
          throw new Error('Legacy repair must not fetch the original Telegram file');
        },
      },
      store: {
        async put(): Promise<never> {
          throw new Error('Legacy repair must not upload another object');
        },
      },
    };
    await processMedia(testDb.db, repairDeps, { mediaObjectId: id });
    expect(await processMedia(testDb.db, repairDeps, { mediaObjectId: id })).toBe('stale');
    const [repaired] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(repaired).toEqual(original);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, `media-processed:${id}`));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'MEDIA_PROCESSED',
      occurredAt: processedAt,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      employeeId,
      payload: {
        mediaObjectId: id,
        quality: 'DUPLICATE_SUSPECT',
        duplicateOfId,
        width: 1280,
        height: 960,
      },
    });
  });
  it('does not overwrite a successful concurrent attempt with a delayed failure', async () => {
    const id = await media('concurrent-retry');
    fetcher.files.set('concurrent-retry', await jpeg(320, 240, 128));
    let enter: () => void = () => {};
    let release: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const losingAttempt = processMedia(
      testDb.db,
      {
        ...deps,
        fetcher: {
          async fetch(): Promise<never> {
            enter();
            await blocked;
            throw new Error('Delayed failed download');
          },
        },
      },
      { mediaObjectId: id },
    );
    const rejected = expect(losingAttempt).rejects.toThrow('Delayed failed download');
    await entered;
    let winner: typeof mediaObjects.$inferSelect | undefined;
    try {
      expect(await processMedia(testDb.db, deps, { mediaObjectId: id })).toBe('processed');
      [winner] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    } finally {
      release();
      await rejected;
    }
    const [after] = await testDb.db.select().from(mediaObjects).where(eq(mediaObjects.id, id));
    expect(after).toEqual(winner);
    expect(after).toMatchObject({ attempts: 1, lastError: null });
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, `media-processed:${id}`));
    expect(events).toHaveLength(1);
  });
});
