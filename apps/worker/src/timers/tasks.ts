import { z } from 'zod';
import { TimerTask, timerTaskKey } from '@vakhta/contracts';
import {
  BackgroundTaskLeaseLostError,
  claimBackgroundTasks,
  retryBackgroundTask,
  runBackgroundTask,
  type BackgroundTaskErrorCode,
  type Database,
  type Transaction,
} from '@vakhta/db';
import {
  handleAckReminderWithin,
  handleShiftReminderWithin,
  type ReminderOutcome,
} from './reminders.js';
import { handleCleaningReminderWithin, handleHandoverTimeoutWithin } from './handover-timers.js';
import { handleDowntimeEscalationWithin, handleReturnReminderWithin } from './shift-timers.js';
import { handleIncidentSlaWithin } from './incident-sla.js';

export const TIMER_TASK_KINDS = [
  'SHIFT_REMINDER',
  'ACK_REMINDER',
  'RETURN_REMINDER',
  'DOWNTIME_ESCALATION',
  'CLEANING_REMINDER',
  'INCIDENT_SLA',
  'HANDOVER_TIMEOUT',
] as const;
const DispatchOptions = z.object({
  batch: z.number().int().min(1).max(50).default(10),
  leaseMs: z.number().int().min(1000).max(300_000).default(60_000),
  retryMs: z.number().int().min(1).max(86_400_000).default(30_000),
  autoCloseGraceMinutes: z.number().int().positive().default(120),
});

/** Every effect runs on the task completion transaction; no Redis or Telegram I/O belongs here. */
export function executeTimerWithin(
  tx: Transaction,
  task: TimerTask,
  now: Date | undefined,
  autoCloseGraceMinutes = 120,
): Promise<ReminderOutcome> {
  switch (task.kind) {
    case 'SHIFT_REMINDER':
      return handleShiftReminderWithin(tx, task.payload, now);
    case 'ACK_REMINDER':
      return handleAckReminderWithin(tx, task.payload, now);
    case 'RETURN_REMINDER':
      return handleReturnReminderWithin(tx, task.payload, now, autoCloseGraceMinutes);
    case 'DOWNTIME_ESCALATION':
      return handleDowntimeEscalationWithin(tx, task.payload, now, autoCloseGraceMinutes);
    case 'CLEANING_REMINDER':
      return handleCleaningReminderWithin(tx, task.payload, now);
    case 'INCIDENT_SLA':
      return handleIncidentSlaWithin(tx, task.payload, now);
    case 'HANDOVER_TIMEOUT':
      return handleHandoverTimeoutWithin(tx, task.payload, now);
  }
}

export async function dispatchTimerTasks(
  db: Database,
  input: Partial<z.infer<typeof DispatchOptions>> = {},
) {
  const options = DispatchOptions.parse(input);
  const tasks = await claimBackgroundTasks(db, {
    kinds: [...TIMER_TASK_KINDS],
    limit: options.batch,
    leaseMs: options.leaseMs,
  });
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      let errorCode: BackgroundTaskErrorCode = 'EXECUTION_FAILED';
      try {
        if (task.payloadVersion !== 1) {
          errorCode = 'UNSUPPORTED_VERSION';
          throw new Error('Unsupported timer version');
        }
        const parsed = TimerTask.safeParse({ kind: task.kind, payload: task.payload });
        if (
          !parsed.success ||
          timerTaskKey(parsed.data) !== task.dedupeKey ||
          new Date(parsed.data.payload.fireAt).getTime() !== task.dueAt.getTime()
        ) {
          errorCode = 'INVALID_PAYLOAD';
          throw new Error('Invalid timer payload');
        }
        await runBackgroundTask(db, task, (tx) =>
          executeTimerWithin(tx, parsed.data, undefined, options.autoCloseGraceMinutes),
        );
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
    throw new Error('Timer task persistence failed');
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
