import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /** Без токена релей аутбоксу вимкнений: рядки чекають у PENDING. */
  TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OUTBOX_POLL_MS: z.coerce.number().int().min(200).default(1000),
  OUTBOX_BATCH: z.coerce.number().int().min(1).max(200).default(20),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  /** Приватне сховище фото (ADR-0006); без S3_BUCKET фото лишаються PENDING. */
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_FORCE_PATH_STYLE: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .default(true),
  /** Пороги технічної перевірки фото (FR-PHO-03). */
  MEDIA_MIN_WIDTH: z.coerce.number().int().positive().default(640),
  MEDIA_MIN_HEIGHT: z.coerce.number().int().positive().default(480),
  MEDIA_MIN_BRIGHTNESS: z.coerce.number().int().min(0).max(255).default(40),
  MEDIA_NEAR_DUPLICATE_DISTANCE: z.coerce.number().int().min(0).max(64).default(6),
  MEDIA_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function loadWorkerEnv(source: Record<string, unknown>): WorkerEnv {
  const parsed = WorkerEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некоректна конфігурація worker: ${issues}`);
  }
  return parsed.data;
}
