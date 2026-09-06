import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import {
  AckReminderJob,
  CleaningReminderJob,
  DowntimeEscalationJob,
  HandoverTimeoutJob,
  IncidentSlaJob,
  MediaJob,
  QUEUES,
  ReturnReminderJob,
  ShiftReminderJob,
} from '@vakhta/contracts';
import { createDatabase } from '@vakhta/db';
import { TIMER_JOBS } from '@vakhta/domain';
import { loadWorkerEnv } from './env.js';
import { initSentry, reportJobFailure, Sentry } from './observability/sentry.js';
import { TelegramSender, relayOnce } from './outbox/relay.js';
import { handleAckReminder, handleShiftReminder } from './timers/reminders.js';
import { S3MediaStore, TelegramFileFetcher } from './media/adapters.js';
import { processMedia } from './media/process.js';
import { handleCleaningReminder, handleHandoverTimeout } from './timers/handover-timers.js';
import { handleIncidentSla } from './timers/incident-sla.js';
import { handleDowntimeEscalation, handleReturnReminder } from './timers/shift-timers.js';

const env = loadWorkerEnv(process.env);
const sentry = initSentry(env);

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
      .catch((err: unknown) => {
        logger.error({ err }, 'outbox relay');
        reportJobFailure('outbox', undefined, err);
      })
      .finally(() => {
        relayBusy = false;
      });
  }, env.OUTBOX_POLL_MS);
} else {
  logger.warn('TELEGRAM_BOT_TOKEN не задано: релей аутбоксу вимкнений, рядки лишаються PENDING');
}

/* ------------------------------------------------------------------ */
/* Фото-пайплайн (ADR-0006)                                            */
/* ------------------------------------------------------------------ */

const mediaStore = S3MediaStore.fromEnv(env);
const mediaDeps =
  mediaStore && env.TELEGRAM_BOT_TOKEN
    ? {
        fetcher: new TelegramFileFetcher(env.TELEGRAM_BOT_TOKEN),
        store: mediaStore,
        options: {
          thresholds: {
            minWidth: env.MEDIA_MIN_WIDTH,
            minHeight: env.MEDIA_MIN_HEIGHT,
            minBrightness: env.MEDIA_MIN_BRIGHTNESS,
            nearDuplicateDistance: env.MEDIA_NEAR_DUPLICATE_DISTANCE,
          },
          retentionDays: env.MEDIA_RETENTION_DAYS,
        },
      }
    : null;
if (!mediaDeps) logger.warn('фото-пайплайн вимкнений: потрібні S3_* і TELEGRAM_BOT_TOKEN');

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
    case TIMER_JOBS.incidentSla: {
      const outcome = await handleIncidentSla(db, IncidentSlaJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.handoverTimeout: {
      const outcome = await handleHandoverTimeout(db, HandoverTimeoutJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.cleaningReminder: {
      const outcome = await handleCleaningReminder(db, CleaningReminderJob.parse(job.data));
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
      if (!mediaDeps) {
        logger.warn(
          { jobId: job.id },
          'media: S3 або токен бота не налаштовано, фото лишається PENDING',
        );
        return;
      }
      const outcome = await processMedia(db, mediaDeps, MediaJob.parse(job.data));
      logger.info({ queue: QUEUES.media, jobId: job.id, outcome }, 'media');
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
  w.on('failed', (job, err) => {
    logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed');
    reportJobFailure(w.name, job?.id, err);
  });
  w.on('error', (err) => {
    logger.error({ queue: w.name, err }, 'worker error');
    reportJobFailure(w.name, undefined, err);
  });
}

logger.info(
  { queues: workers.map((w) => w.name), outboxRelay: sender !== null, sentry },
  'worker запущено',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'зупинка worker');
  if (relayTimer) clearInterval(relayTimer);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await client.end({ timeout: 5 });
  await Sentry.flush(2000);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
