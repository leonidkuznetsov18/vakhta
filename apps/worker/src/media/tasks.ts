import { z } from 'zod';
import { MediaJob } from '@vakhta/contracts';
import {
  and,
  asc,
  backgroundTasks,
  BackgroundTaskLeaseLostError,
  claimBackgroundTasks,
  domainEvents,
  enqueueBonusRecalculation,
  enqueueMediaProcessing,
  eq,
  handoverMedia,
  handoverRecords,
  isNull,
  mediaObjects,
  ne,
  notExists,
  or,
  retryBackgroundTask,
  runBackgroundTask,
  sql,
  type BackgroundTaskErrorCode,
  type BackgroundTaskLease,
  type Database,
} from '@vakhta/db';
import {
  finalizeMediaWithin,
  MediaDependencyUnavailableError,
  prepareMediaWithTimeout,
  type MediaDependencies,
} from './process.js';

export const MediaDispatchOptions = z
  .object({
    batch: z.number().int().min(1).max(10).default(2),
    leaseMs: z.number().int().min(1000).max(300_000).default(120_000),
    ioTimeoutMs: z.number().int().min(1).max(120_000).default(60_000),
    retryMs: z.number().int().min(1).max(86_400_000).default(30_000),
  })
  .refine(
    (value) => value.ioTimeoutMs < value.leaseMs,
    'I/O timeout must be shorter than the lease',
  );
export type MediaDispatchOptions = z.infer<typeof MediaDispatchOptions>;

interface DispatchCounts {
  claimed: number;
  completed: number;
  retried: number;
  lost: number;
}

/** A dispatcher restart needs no in-memory receipt; expired leases remain claimable in PostgreSQL. */
export async function dispatchMediaTasks(
  db: Database,
  deps: MediaDependencies | null,
  input: Partial<MediaDispatchOptions> = {},
): Promise<DispatchCounts> {
  const options = MediaDispatchOptions.parse(input);
  const tasks = await claimBackgroundTasks(db, {
    kinds: ['MEDIA_PROCESS'],
    limit: options.batch,
    leaseMs: options.leaseMs,
  });
  const settled = await Promise.allSettled(
    tasks.map((task) => executeMediaTask(db, deps, task, options)),
  );
  const outcomes: Array<'completed' | 'retried' | 'lost'> = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') outcomes.push(result.value);
  }
  if (outcomes.length !== tasks.length) throw new Error('Media task persistence failed');
  return {
    claimed: tasks.length,
    completed: outcomes.filter((v) => v === 'completed').length,
    retried: outcomes.filter((v) => v === 'retried').length,
    lost: outcomes.filter((v) => v === 'lost').length,
  };
}

async function executeMediaTask(
  db: Database,
  deps: MediaDependencies | null,
  task: BackgroundTaskLease,
  options: MediaDispatchOptions,
): Promise<'completed' | 'retried' | 'lost'> {
  let errorCode: BackgroundTaskErrorCode = 'EXECUTION_FAILED';
  try {
    if (task.payloadVersion !== 1) {
      errorCode = 'UNSUPPORTED_VERSION';
      throw new Error('Unsupported media task version');
    }
    const parsed = MediaJob.safeParse(task.payload);
    if (!parsed.success || task.dedupeKey !== `media.${parsed.data.mediaObjectId}`) {
      errorCode = 'INVALID_PAYLOAD';
      throw new Error('Invalid media task payload');
    }
    const prepared = await prepareMediaWithTimeout(db, deps, parsed.data, options.ioTimeoutMs);
    await runBackgroundTask(db, task, (tx) => finalizeMediaWithin(tx, prepared));
    return 'completed';
  } catch (error) {
    if (error instanceof BackgroundTaskLeaseLostError) return 'lost';
    if (error instanceof MediaDependencyUnavailableError) errorCode = 'DEPENDENCY_UNAVAILABLE';
    const retried = await retryBackgroundTask(db, task, { delayMs: options.retryMs, errorCode });
    return retried ? 'retried' : 'lost';
  }
}

/** Repeat bounded anti-joins against current facts; no timestamp cursor can lose a late commit. */
export async function recoverMediaTasks(
  db: Database,
  limit = 100,
): Promise<{ admitted: number; bonusQueued: number; inconsistent: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid media recovery batch');
  const missingEvent = notExists(
    db
      .select({ one: sql`1` })
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, sql`'media-processed:' || ${mediaObjects.id}::text`)),
  );
  const missingTask = notExists(
    db
      .select({ one: sql`1` })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.dedupeKey, sql`'media.' || ${mediaObjects.id}::text`)),
  );
  const candidates = await db
    .select({ id: mediaObjects.id, receivedAt: mediaObjects.receivedAt })
    .from(mediaObjects)
    .where(
      and(
        or(isNull(mediaObjects.processedAt), isNull(mediaObjects.storageKey), missingEvent),
        missingTask,
      ),
    )
    .orderBy(asc(mediaObjects.receivedAt), asc(mediaObjects.id))
    .limit(limit);
  let admitted = 0;
  for (const candidate of candidates) {
    const result = await db.transaction((tx) => enqueueMediaProcessing(tx, candidate));
    if (result.created) admitted += 1;
  }
  const targets = await db
    .selectDistinct({
      sourceEventId: domainEvents.id,
      dueAt: domainEvents.occurredAt,
      targetSessionId: handoverRecords.shiftSessionId,
    })
    .from(handoverMedia)
    .innerJoin(handoverRecords, eq(handoverMedia.handoverId, handoverRecords.id))
    .innerJoin(
      domainEvents,
      eq(
        domainEvents.idempotencyKey,
        sql`'media-processed:' || ${handoverMedia.mediaObjectId}::text`,
      ),
    )
    .where(
      and(
        eq(domainEvents.type, 'MEDIA_PROCESSED'),
        ne(handoverRecords.status, 'SUPERSEDED'),
        notExists(
          db
            .select({ one: sql`1` })
            .from(backgroundTasks)
            .where(
              and(
                eq(backgroundTasks.kind, 'BONUS_RECALCULATE'),
                eq(backgroundTasks.sourceEventId, domainEvents.id),
                eq(backgroundTasks.targetSessionId, handoverRecords.shiftSessionId),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(domainEvents.id), asc(handoverRecords.shiftSessionId))
    .limit(limit);
  let bonusQueued = 0;
  for (const target of targets) {
    const result = await db.transaction((tx) => enqueueBonusRecalculation(tx, target));
    if (result.created) bonusQueued += 1;
  }
  // Completed-task contradictions are diagnostics, not authority to reopen history or invent keys.
  const inconsistent = await db
    .select({ id: mediaObjects.id })
    .from(mediaObjects)
    .innerJoin(
      backgroundTasks,
      eq(backgroundTasks.dedupeKey, sql`'media.' || ${mediaObjects.id}::text`),
    )
    .where(
      and(
        eq(backgroundTasks.status, 'COMPLETED'),
        or(isNull(mediaObjects.processedAt), isNull(mediaObjects.storageKey), missingEvent),
      ),
    )
    .limit(limit);
  return { admitted, bonusQueued, inconsistent: inconsistent.length };
}
