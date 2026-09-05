import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  and,
  desc,
  domainEvents,
  eq,
  gte,
  isNotNull,
  mediaObjects,
  ne,
  sql,
  type Database,
} from '@vakhta/db';
import {
  PHASH_SIZE,
  assessQuality,
  findDuplicate,
  phashFromGray,
  type MediaQualityStatus,
  type QualityThresholds,
} from '@vakhta/domain';
import type { MediaJob } from '@vakhta/contracts';

/** Порт до Telegram: getFile + завантаження за file_path. */
export interface FileFetcher {
  fetch(fileId: string): Promise<{ buffer: Buffer; contentType: string | null }>;
}

/** Порт до приватного сховища (S3-сумісного). */
export interface MediaStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export interface ProcessOptions {
  readonly thresholds: QualityThresholds;
  readonly retentionDays: number;
  readonly duplicateLookbackDays?: number;
  readonly now?: () => Date;
}

export type ProcessOutcome = 'processed' | 'stale' | 'missing';

/** Метрики зображення через sharp: розміри, середня яскравість, pHash з 32×32 сірого. */
export async function analyseImage(buffer: Buffer): Promise<{
  width: number;
  height: number;
  brightness: number;
  phash: string;
  contentType: string;
}> {
  const image = sharp(buffer, { failOn: 'error' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error('зображення без розмірів');
  const gray = await image
    .clone()
    .rotate()
    .grayscale()
    .resize(PHASH_SIZE, PHASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer();
  let sum = 0;
  for (const v of gray) sum += v;
  const phash = phashFromGray(gray, PHASH_SIZE);
  return {
    width: meta.width,
    height: meta.height,
    brightness: Math.round(sum / gray.length),
    phash,
    contentType: meta.format === 'png' ? 'image/png' : 'image/jpeg',
  };
}

/**
 * Перенесення фото з Telegram у приватне сховище і технічна перевірка (ADR-0006, FR-PHO-02/03).
 * Підозра на повтор або низька якість позначають фото, але не карають (T-25, T-26).
 */
export async function processMedia(
  db: Database,
  deps: { fetcher: FileFetcher; store: MediaStore; options: ProcessOptions },
  job: MediaJob,
): Promise<ProcessOutcome> {
  const now = deps.options.now?.() ?? new Date();
  const [row] = await db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, job.mediaObjectId))
    .limit(1);
  if (!row) return 'missing';
  if (row.processedAt && row.storageKey) return 'stale';

  try {
    const { buffer, contentType: fetchedType } = await deps.fetcher.fetch(row.telegramFileId);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    let analysed: Awaited<ReturnType<typeof analyseImage>> | null = null;
    try {
      analysed = await analyseImage(buffer);
    } catch {
      analysed = null;
    }
    const metrics = analysed
      ? {
          width: analysed.width,
          height: analysed.height,
          brightness: analysed.brightness,
          sizeBytes: buffer.length,
        }
      : null;
    let quality: MediaQualityStatus = assessQuality(metrics, deps.options.thresholds);
    let duplicateOfId: string | null = null;
    let notes: string | null = null;

    if (analysed && quality === 'OK') {
      const since = new Date(
        now.getTime() - (deps.options.duplicateLookbackDays ?? 30) * 86_400_000,
      );
      const others = await db
        .select({ id: mediaObjects.id, sha256: mediaObjects.sha256, phash: mediaObjects.phash })
        .from(mediaObjects)
        .where(
          and(
            ne(mediaObjects.id, row.id),
            isNotNull(mediaObjects.processedAt),
            gte(mediaObjects.receivedAt, since),
          ),
        )
        .orderBy(desc(mediaObjects.receivedAt))
        .limit(500);
      const verdict = findDuplicate(
        { sha256, phash: analysed.phash },
        others,
        deps.options.thresholds,
      );
      if (verdict.kind !== 'NONE') {
        quality = 'DUPLICATE_SUSPECT';
        duplicateOfId = verdict.ofId;
        notes =
          verdict.kind === 'EXACT'
            ? 'точний повтор за SHA-256'
            : `схоже на ${verdict.ofId} (відстань ${verdict.distance})`;
      }
    }

    const contentType = analysed?.contentType ?? fetchedType ?? 'application/octet-stream';
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `${row.purpose}/${now.toISOString().slice(0, 7)}/${row.id}.${ext}`;
    await deps.store.put(key, buffer, contentType);

    await db
      .update(mediaObjects)
      .set({
        storageKey: key,
        contentType,
        sizeBytes: buffer.length,
        width: analysed?.width ?? row.width,
        height: analysed?.height ?? row.height,
        sha256,
        phash: analysed?.phash ?? null,
        brightness: analysed?.brightness ?? null,
        quality,
        qualityNotes: notes,
        duplicateOfId,
        processedAt: now,
        attempts: row.attempts + 1,
        lastError: null,
        retentionUntil: new Date(now.getTime() + deps.options.retentionDays * 86_400_000),
      })
      .where(eq(mediaObjects.id, row.id));

    await db
      .insert(domainEvents)
      .values({
        type: 'MEDIA_PROCESSED',
        occurredAt: now,
        source: 'SYSTEM',
        actingRole: 'SYSTEM',
        employeeId: row.uploadedBy,
        idempotencyKey: `media-processed:${row.id}`,
        payload: {
          mediaObjectId: row.id,
          quality,
          duplicateOfId,
          width: analysed?.width ?? null,
          height: analysed?.height ?? null,
        },
      })
      .onConflictDoNothing({
        target: domainEvents.idempotencyKey,
        where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
      });
    return 'processed';
  } catch (error) {
    await db
      .update(mediaObjects)
      .set({
        attempts: row.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(mediaObjects.id, row.id));
    throw error;
  }
}
