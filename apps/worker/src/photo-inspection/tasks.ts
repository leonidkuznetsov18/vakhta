import { z } from 'zod';
import {
  INSPECTION_MODEL,
  INSPECTION_PROMPT_VERSION,
  InspectionContext,
  InspectionPrediction,
  InspectionRules,
} from '@vakhta/contracts';
import {
  BackgroundTaskLeaseLostError,
  claimBackgroundTasks,
  eq,
  mediaObjects,
  photoInspectionRuns,
  retryBackgroundTask,
  runBackgroundTask,
  type Database,
} from '@vakhta/db';
import { InspectionFailure, type InspectionAnalyzer, type InspectionResult } from './gemma.js';

/** Twelve model calls at most per run, each a few seconds; the lease outlives the timeout. */
export const INSPECTION_TIMEOUT_MS = 240_000;
export const INSPECTION_LEASE_MS = 300_000;

export async function dispatchInspectionTasks(
  db: Database,
  analyzer: InspectionAnalyzer | null,
  options: { timeoutMs?: number; leaseMs?: number; retryMs?: number } = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? INSPECTION_TIMEOUT_MS;
  const tasks = await claimBackgroundTasks(db, {
    kinds: ['PHOTO_INSPECT'],
    limit: 1,
    leaseMs: options.leaseMs ?? INSPECTION_LEASE_MS,
  });
  for (const task of tasks) {
    const payload = z.object({ runId: z.uuid() }).safeParse(task.payload);
    if (
      !payload.success ||
      task.payloadVersion !== 1 ||
      task.dedupeKey !== `photo-inspect.${payload.data.runId}`
    ) {
      await retryBackgroundTask(db, task, { delayMs: 86_400_000, errorCode: 'INVALID_PAYLOAD' });
      continue;
    }
    const [run] = await db
      .select()
      .from(photoInspectionRuns)
      .where(eq(photoInspectionRuns.id, payload.data.runId));
    if (!run) {
      await retryBackgroundTask(db, task, { delayMs: 86_400_000, errorCode: 'INVALID_PAYLOAD' });
      continue;
    }
    let result: InspectionResult | null = null;
    let failure: string | null = null;
    if (run.status === 'PENDING') {
      try {
        if (task.attempts > 3) throw new InspectionFailure('AI_RETRY_EXHAUSTED');
        if (!analyzer) throw new InspectionFailure('AI_NOT_CONFIGURED');
        if (run.model !== INSPECTION_MODEL || run.promptVersion !== INSPECTION_PROMPT_VERSION)
          throw new InspectionFailure('UNSUPPORTED_VERSION');
        const context = InspectionContext.parse(run.context);
        const rules = InspectionRules.safeParse(JSON.parse(run.guidance));
        if (!rules.success) throw new InspectionFailure('RULES_MISSING');
        const [media] = await db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, context.mediaId));
        if (!media?.storageKey || media.sha256 !== context.sha256)
          throw new InspectionFailure('IMAGE_UNAVAILABLE');
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          result = await Promise.race([
            analyzer.analyze(
              { context, rules: rules.data, model: run.model, storageKey: media.storageKey },
              abort.signal,
            ),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => {
                abort.abort();
                reject(new InspectionFailure('AI_TIMEOUT', true));
              }, timeoutMs);
            }),
          ]);
          result.prediction = InspectionPrediction.parse(result.prediction);
        } finally {
          if (timer) clearTimeout(timer);
          abort.abort();
        }
      } catch (error) {
        result = null;
        const classified =
          error instanceof InspectionFailure ? error : new InspectionFailure('ANALYSIS_FAILED');
        if (classified.retryable && task.attempts < 3) {
          await retryBackgroundTask(db, task, {
            delayMs: options.retryMs ?? 30_000,
            errorCode: 'DEPENDENCY_UNAVAILABLE',
          });
          continue;
        }
        failure = classified.code;
      }
    }
    try {
      await runBackgroundTask(db, task, async (tx) => {
        if (run.status !== 'PENDING') return;
        await tx
          .update(photoInspectionRuns)
          .set(
            result
              ? {
                  status: 'SUCCEEDED',
                  prediction: result.prediction,
                  usage: result.usage,
                  completedAt: new Date(),
                }
              : {
                  status: 'FAILED',
                  errorCode: failure ?? 'ANALYSIS_FAILED',
                  completedAt: new Date(),
                },
          )
          .where(eq(photoInspectionRuns.id, run.id));
      });
    } catch (error) {
      if (error instanceof BackgroundTaskLeaseLostError) continue;
      throw error;
    }
  }
  return tasks.length;
}
