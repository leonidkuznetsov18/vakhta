import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  and,
  desc,
  domainEvents,
  enqueueMediaBonusRecalculations,
  eq,
  gte,
  isNotNull,
  isNull,
  mediaObjects,
  ne,
  or,
  sql,
  type Database,
  type Transaction,
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
  fetch(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{ buffer: Buffer; contentType: string | null }>;
}

/** Private S3-compatible object storage port. */
export interface MediaStore {
  put(key: string, body: Buffer, contentType: string, signal?: AbortSignal): Promise<void>;
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

export interface MediaDependencies {
  readonly fetcher: FileFetcher;
  readonly store: MediaStore;
  readonly options: ProcessOptions;
}

type MediaRow = typeof mediaObjects.$inferSelect;
type CompletedMediaValues = Pick<
  MediaRow,
  | 'storageKey'
  | 'contentType'
  | 'sizeBytes'
  | 'width'
  | 'height'
  | 'sha256'
  | 'phash'
  | 'brightness'
  | 'quality'
  | 'qualityNotes'
  | 'duplicateOfId'
  | 'processedAt'
  | 'retentionUntil'
>;
export type MediaPreparation =
  | { readonly kind: 'missing' | 'complete'; readonly mediaObjectId: string }
  | {
      readonly kind: 'prepared';
      readonly mediaObjectId: string;
      readonly values: CompletedMediaValues;
    };

export class MediaDependencyUnavailableError extends Error {
  constructor() {
    super('Media processing dependencies are unavailable');
  }
}

/** Reads and external I/O only. A late result cannot write a projection by itself. */
export async function prepareMedia(
  db: Database,
  deps: MediaDependencies | null,
  job: MediaJob,
  signal?: AbortSignal,
): Promise<MediaPreparation> {
  const now = deps?.options.now?.() ?? new Date();
  const [row] = await db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, job.mediaObjectId))
    .limit(1);
  if (!row) return { kind: 'missing', mediaObjectId: job.mediaObjectId };
  if (row.processedAt && row.storageKey) return { kind: 'complete', mediaObjectId: row.id };
  if (!deps) throw new MediaDependencyUnavailableError();
  signal?.throwIfAborted();
  const { buffer, contentType: fetchedType } = await deps.fetcher.fetch(row.telegramFileId, signal);
  signal?.throwIfAborted();
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  let analysed: Awaited<ReturnType<typeof analyseImage>> | null = null;
  try {
    analysed = await analyseImage(buffer);
  } catch {
    analysed = null;
  }
  signal?.throwIfAborted();
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
    const since = new Date(now.getTime() - (deps.options.duplicateLookbackDays ?? 30) * 86_400_000);
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
  signal?.throwIfAborted();
  await deps.store.put(key, buffer, contentType, signal);
  signal?.throwIfAborted();

  return {
    kind: 'prepared',
    mediaObjectId: row.id,
    values: {
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
      retentionUntil: new Date(now.getTime() + deps.options.retentionDays * 86_400_000),
    },
  };
}

/** Bound the complete preparation path, including adapters that are slow to observe cancellation. */
export async function prepareMediaWithTimeout(
  db: Database,
  deps: MediaDependencies | null,
  job: MediaJob,
  timeoutMs: number,
): Promise<MediaPreparation> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error('Invalid media I/O timeout');
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error('Media processing timed out');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([prepareMedia(db, deps, job, controller.signal), expired]);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** Caller owns the transaction; durable execution includes task completion in this same boundary. */
export async function finalizeMediaWithin(
  tx: Transaction,
  prepared: MediaPreparation,
): Promise<ProcessOutcome> {
  if (prepared.kind === 'missing') return 'missing';
  const [current] = await tx
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, prepared.mediaObjectId))
    .for('no key update');
  if (!current) return 'missing';
  if (current.processedAt && current.storageKey) {
    await ensureProcessedEvent(tx, current);
    return 'stale';
  }
  if (prepared.kind !== 'prepared') throw new Error('Completed media projection disappeared');
  const [completed] = await tx
    .update(mediaObjects)
    .set({
      ...prepared.values,
      attempts: sql`${mediaObjects.attempts} + 1`,
      lastError: null,
    })
    .where(eq(mediaObjects.id, current.id))
    .returning();
  if (!completed) throw new Error('Media completion did not return a row');
  await ensureProcessedEvent(tx, completed);
  return 'processed';
}

/** Legacy BullMQ drain shares the same bounded preparation and atomic finalizer. */
export async function processMedia(
  db: Database,
  deps: MediaDependencies | null,
  job: MediaJob,
): Promise<ProcessOutcome> {
  try {
    const prepared = await prepareMediaWithTimeout(db, deps, job, 60_000);
    return await db.transaction((tx) => finalizeMediaWithin(tx, prepared));
  } catch (error) {
    await db
      .update(mediaObjects)
      .set({
        attempts: sql`${mediaObjects.attempts} + 1`,
        lastError: 'EXECUTION_FAILED',
      })
      .where(
        and(
          eq(mediaObjects.id, job.mediaObjectId),
          or(isNull(mediaObjects.processedAt), isNull(mediaObjects.storageKey)),
        ),
      );
    throw error;
  }
}

/** Repair a legacy event gap from the locked projection, preserving its original processing time. */
async function ensureProcessedEvent(
  tx: Transaction,
  row: typeof mediaObjects.$inferSelect,
): Promise<void> {
  if (!row.processedAt || !row.storageKey) throw new Error('Media projection is not complete');
  const [inserted] = await tx
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
    })
    .returning({ id: domainEvents.id, occurredAt: domainEvents.occurredAt });
  const event =
    inserted ??
    (
      await tx
        .select({ id: domainEvents.id, occurredAt: domainEvents.occurredAt })
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.idempotencyKey, `media-processed:${row.id}`),
            eq(domainEvents.type, 'MEDIA_PROCESSED'),
          ),
        )
    )[0];
  if (!event) throw new Error('Media completion event is missing');
  await enqueueMediaBonusRecalculations(tx, row.id, event);
}
