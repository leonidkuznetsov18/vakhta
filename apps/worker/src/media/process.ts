import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  and,
  desc,
  domainEvents,
  eq,
  gte,
  isNotNull,
  isNull,
  mediaObjects,
  ne,
  or,
  sql,
  type Database,
  type DbOrTx,
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

/** Telegram download port: getFile followed by the private file download. */
export interface FileFetcher {
  fetch(fileId: string): Promise<{ buffer: Buffer; contentType: string | null }>;
}

/** Private S3-compatible object storage port. */
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

/** Image dimensions, average brightness and perceptual hash from a 32x32 grayscale sample. */
export async function analyseImage(buffer: Buffer): Promise<{
  width: number;
  height: number;
  brightness: number;
  phash: string;
  contentType: string;
}> {
  const image = sharp(buffer, { failOn: 'error' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error('Image has no dimensions');
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
 * Download and assess evidence without penalizing suspected duplicates or low quality.
 * Network I/O is retryable; the completed projection and its event commit atomically.
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
  if (row.processedAt && row.storageKey) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, row.id))
        .for('no key update');
      if (!current) return 'missing';
      await ensureProcessedEvent(tx, current);
      return 'stale';
    });
  }

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
            ? 'Exact SHA-256 duplicate'
            : `Similar to ${verdict.ofId} (distance ${verdict.distance})`;
      }
    }

    const contentType = analysed?.contentType ?? fetchedType ?? 'application/octet-stream';
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `${row.purpose}/${row.receivedAt.toISOString().slice(0, 7)}/${row.id}.${ext}`;
    await deps.store.put(key, buffer, contentType);

    return await db.transaction(async (tx) => {
      // Lock only after I/O: another attempt may already have completed this object.
      const [current] = await tx
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, row.id))
        .for('no key update');
      if (!current) return 'missing';
      if (current.processedAt && current.storageKey) {
        await ensureProcessedEvent(tx, current);
        return 'stale';
      }
      const [completed] = await tx
        .update(mediaObjects)
        .set({
          storageKey: key,
          contentType,
          sizeBytes: buffer.length,
          width: analysed?.width ?? current.width,
          height: analysed?.height ?? current.height,
          sha256,
          phash: analysed?.phash ?? null,
          brightness: analysed?.brightness ?? null,
          quality,
          qualityNotes: notes,
          duplicateOfId,
          processedAt: now,
          attempts: sql`${mediaObjects.attempts} + 1`,
          lastError: null,
          retentionUntil: new Date(now.getTime() + deps.options.retentionDays * 86_400_000),
        })
        .where(eq(mediaObjects.id, row.id))
        .returning();
      if (!completed) throw new Error('Media completion did not return a row');
      await ensureProcessedEvent(tx, completed);
      return 'processed';
    });
  } catch (error) {
    await db
      .update(mediaObjects)
      .set({
        attempts: sql`${mediaObjects.attempts} + 1`,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(
        and(
          eq(mediaObjects.id, row.id),
          or(isNull(mediaObjects.processedAt), isNull(mediaObjects.storageKey)),
        ),
      );
    throw error;
  }
}

/** Repair a legacy event gap from the locked projection, preserving its original processing time. */
async function ensureProcessedEvent(
  tx: DbOrTx,
  row: typeof mediaObjects.$inferSelect,
): Promise<void> {
  if (!row.processedAt || !row.storageKey) throw new Error('Media projection is not complete');
  await tx
    .insert(domainEvents)
    .values({
      type: 'MEDIA_PROCESSED',
      occurredAt: row.processedAt,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      employeeId: row.uploadedBy,
      idempotencyKey: `media-processed:${row.id}`,
      payload: {
        mediaObjectId: row.id,
        quality: row.quality,
        duplicateOfId: row.duplicateOfId,
        width: row.width,
        height: row.height,
      },
    })
    .onConflictDoNothing({
      target: domainEvents.idempotencyKey,
      where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
    });
}
