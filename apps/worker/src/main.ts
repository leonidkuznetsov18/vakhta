import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import {
  AckReminderJob,
  DowntimeEscalationJob,
  QUEUES,
  ReturnReminderJob,
  ShiftReminderJob,
} from '@vakhta/contracts';
import { createDatabase } from '@vakhta/db';
import { TIMER_JOBS } from '@vakhta/domain';
import { loadWorkerEnv } from './env.js';
import { TelegramSender, relayOnce } from './outbox/relay.js';
import { handleAckReminder, handleShiftReminder } from './timers/reminders.js';
import { handleDowntimeEscalation, handleReturnReminder } from './timers/shift-timers.js';

const env = loadWorkerEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

const { db, client } = createDatabase(env.DATABASE_URL, { max: 5 });

/** BullMQ вимагає maxRetriesPerRequest: null для блокуючих команд. */
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/* ------------------------------------------------------------------ */
/* Релей аутбоксу (ADR-8)                                              */
/* ------------------------------------------------------------------ */

const sender = env.TELEGRAM_BOT_TOKEN ? TelegramSender.fromToken(env.TELEGRAM_BOT_TOKEN) : null;
let relayBusy = false;
let relayTimer: NodeJS.Timeout | null = null;

if (sender) {
  relayTimer = setInterval(() => {
    if (relayBusy) return;
    relayBusy = true;
    relayOnce(db, sender, { batch: env.OUTBOX_BATCH, maxAttempts: env.OUTBOX_MAX_ATTEMPTS })
      .then((r) => {
        if (r.sent || r.skipped || r.failed || r.retried) logger.info(r, 'outbox');
      })
      .catch((err: unknown) => logger.error({ err }, 'outbox relay'))
      .finally(() => {
        relayBusy = false;
      });
  }, env.OUTBOX_POLL_MS);
} else {
  logger.warn('TELEGRAM_BOT_TOKEN не задано: релей аутбоксу вимкнений, рядки лишаються PENDING');
}

/* ------------------------------------------------------------------ */
/* Черги                                                               */
/* ------------------------------------------------------------------ */

async function processTimer(job: Job): Promise<void> {
  switch (job.name) {
    case TIMER_JOBS.shiftReminder: {
      const outcome = await handleShiftReminder(db, ShiftReminderJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.ackReminder: {
      const outcome = await handleAckReminder(db, AckReminderJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.returnReminder: {
      const outcome = await handleReturnReminder(db, ReturnReminderJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.downtimeEscalation: {
      const outcome = await handleDowntimeEscalation(db, DowntimeEscalationJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    default:
      logger.warn({ job: job.name, jobId: job.id }, 'невідомий таймер');
  }
}

const workers = [
  new Worker(QUEUES.timers, processTimer, { connection, concurrency: 5 }),
  new Worker(
    QUEUES.media,
    async (job) => {
      logger.info({ queue: QUEUES.media, jobId: job.id }, 'media: обробник зʼявиться у фазі 4');
    },
    { connection, concurrency: 2 },
  ),
  new Worker(
    QUEUES.bonus,
    async (job) => {
      logger.info({ queue: QUEUES.bonus, jobId: job.id }, 'bonus: обробник зʼявиться у фазі 5');
    },
    { connection, concurrency: 2 },
  ),
];

for (const w of workers) {
  w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
  w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
}

logger.info(
  { queues: workers.map((w) => w.name), outboxRelay: sender !== null },
  'worker запущено',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'зупинка worker');
  if (relayTimer) clearInterval(relayTimer);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await client.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
