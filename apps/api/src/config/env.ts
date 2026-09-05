import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  TELEGRAM_BOT_USERNAME: z.string().default('VakhtaBot'),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  DEFAULT_SITE_TIMEZONE: z.string().default('Europe/Kyiv'),
  QR_ROTATION_SECONDS: z.coerce.number().int().positive().default(45),
  QR_TTL_SECONDS: z.coerce.number().int().positive().default(90),
});

export type Env = z.infer<typeof EnvSchema>;

/** Валідує env один раз при старті; неповна конфігурація зупиняє процес із зрозумілим списком. */
export function loadEnv(source: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некоректна конфігурація середовища: ${issues}`);
  }
  if (parsed.data.TELEGRAM_BOT_TOKEN && !parsed.data.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET обов'язковий, коли задано TELEGRAM_BOT_TOKEN (ТЗ 12.2)",
    );
  }
  return parsed.data;
}
