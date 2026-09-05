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
