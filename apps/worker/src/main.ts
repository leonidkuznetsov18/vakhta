import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { z } from 'zod';
import { QUEUES, type QueueName } from '@vakhta/contracts';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  REDIS_URL: z.string().min(1),
});
const env = Env.parse(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

/** BullMQ вимагає maxRetriesPerRequest: null для блокуючих команд. */
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Обробники з'являються по фазах (ADR-8): outbox і timers у фазі 1–2, media у фазі 4,
 * bonus у фазі 5. Зараз воркер лише приймає job-и, логує і підтверджує, щоб черги не росли.
 */
const processors: Record<QueueName, (job: Job) => Promise<void>> = {
  [QUEUES.outbox]: async (job) => {
    logger.info({ queue: QUEUES.outbox, jobId: job.id }, 'outbox: обробник ще не реалізовано');
  },
  [QUEUES.timers]: async (job) => {
    logger.info({ queue: QUEUES.timers, jobId: job.id }, 'timers: обробник ще не реалізовано');
  },
  [QUEUES.media]: async (job) => {
    logger.info({ queue: QUEUES.media, jobId: job.id }, 'media: обробник ще не реалізовано');
  },
  [QUEUES.bonus]: async (job) => {
    logger.info({ queue: QUEUES.bonus, jobId: job.id }, 'bonus: обробник ще не реалізовано');
  },
};

const workers = (Object.keys(processors) as QueueName[]).map(
  (name) =>
    new Worker(name, processors[name], {
      connection,
      concurrency: 5,
    }),
);

for (const w of workers) {
  w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
  w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
}

logger.info({ queues: workers.map((w) => w.name) }, 'worker запущено');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'зупинка worker');
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
