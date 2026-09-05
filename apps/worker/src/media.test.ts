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

  async function media(fileId: string): Promise<string> {
    const [row] = await testDb.db
      .insert(mediaObjects)
      .values({
        telegramFileId: fileId,
        telegramFileUniqueId: `u-${fileId}`,
        uploadedBy: employeeId,
        purpose: 'handover',
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
});
