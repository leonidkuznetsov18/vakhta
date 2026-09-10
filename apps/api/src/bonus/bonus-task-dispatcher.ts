import { z } from 'zod';
import { Uuid } from '@vakhta/contracts';
import {
  BackgroundTaskLeaseLostError,
  claimBackgroundTasks,
  domainEvents,
  eq,
  retryBackgroundTask,
  runBackgroundTask,
  type BackgroundTaskErrorCode,
  type Database,
} from '@vakhta/db';
import type { BonusService } from './bonus.service.js';

const Payload = z.object({ sessionId: Uuid }).strict();
const Options = z.object({
  batch: z.number().int().min(1).max(100).default(10),
  leaseMs: z.number().int().min(1000).max(300_000).default(60_000),
  retryMs: z.number().int().min(1).max(86_400_000).default(30_000),
});

/** READ COMMITTED convergence; task, score and criteria share the fenced transaction. */
export async function dispatchBonusTasks(
  db: Database,
  scorer: Pick<BonusService, 'evaluateWithin'>,
  input: Partial<z.infer<typeof Options>> = {},
) {
  const options = Options.parse(input);
  const tasks = await claimBackgroundTasks(db, {
    kinds: ['BONUS_RECALCULATE'],
    limit: options.batch,
    leaseMs: options.leaseMs,
  });
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      let errorCode: BackgroundTaskErrorCode = 'EXECUTION_FAILED';
      try {
        if (task.payloadVersion !== 1) {
          errorCode = 'UNSUPPORTED_VERSION';
          throw new Error('Unsupported bonus task version');
        }
        const parsed = Payload.safeParse(task.payload);
        if (
          !parsed.success ||
          !task.sourceEventId ||
          parsed.data.sessionId !== task.targetSessionId ||
          task.dedupeKey !== `bonus:${task.sourceEventId}:${task.targetSessionId}`
        ) {
          errorCode = 'INVALID_PAYLOAD';
          throw new Error('Invalid bonus task binding');
        }
        await runBackgroundTask(db, task, async (tx, current) => {
          if (!current.sourceEventId) throw new Error('Missing bonus source');
          const [event] = await tx
            .select({ occurredAt: domainEvents.occurredAt })
            .from(domainEvents)
            .where(eq(domainEvents.id, current.sourceEventId));
          if (!event || event.occurredAt.getTime() !== current.dueAt.getTime()) {
            errorCode = 'INVALID_PAYLOAD';
            throw new Error('Invalid bonus source time');
          }
          await scorer.evaluateWithin(tx, parsed.data.sessionId);
        });
        return 'completed';
      } catch (error) {
        if (error instanceof BackgroundTaskLeaseLostError) return 'lost';
        return (await retryBackgroundTask(db, task, { delayMs: options.retryMs, errorCode }))
          ? 'retried'
          : 'lost';
      }
    }),
  );
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('Bonus task persistence failed');
  const outcomes = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  return {
    claimed: tasks.length,
    completed: outcomes.filter((value) => value === 'completed').length,
    retried: outcomes.filter((value) => value === 'retried').length,
    lost: outcomes.filter((value) => value === 'lost').length,
  };
}
