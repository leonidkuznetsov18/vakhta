import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const commaList = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : v,
  z.array(z.string().min(1)),
);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  /** Origin панелі й терміналу через кому; також trustedOrigins для better-auth. */
  CORS_ORIGINS: commaList.default(['http://localhost:5173', 'http://localhost:5174']),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  TELEGRAM_BOT_USERNAME: z.string().default('VakhtaBot'),
  /** webhook для продакшену (потрібна публічна адреса), polling для розробки. За замовчуванням залежить від NODE_ENV. */
  TELEGRAM_MODE: z.preprocess(emptyToUndefined, z.enum(['webhook', 'polling']).optional()),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  DEFAULT_SITE_TIMEZONE: z.string().default('Europe/Kyiv'),
  QR_ROTATION_SECONDS: z.coerce.number().int().positive().default(45),
  QR_TTL_SECONDS: z.coerce.number().int().positive().default(90),
  /** Секрет better-auth: підпис cookie і шифрування TOTP-секретів. Зміна розлогінює всіх. */
  AUTH_SECRET: z.string().min(32),
  /** HMAC-pepper кодів активації (ТЗ 2.2). Зміна pepper робить недійсними всі невикористані коди. */
  ACTIVATION_PEPPER: z.string().min(16),
  ACTIVATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  ACTIVATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Правила графіка (ТЗ 3.2, 18 п. 4): значення для пілоту, уточнюються замовником. */
  SCHEDULE_MIN_REST_MINUTES: z.coerce.number().int().positive().default(660),
  SCHEDULE_MAX_HOURS_PER_MONTH: z.coerce.number().int().positive().default(200),
  SCHEDULE_MAX_CONSECUTIVE_DAYS: z.coerce.number().int().positive().default(4),
  /** Нагадування «зміна скоро» (ТЗ 10): за 2 години. */
  SHIFT_REMINDER_MINUTES: z.coerce.number().int().positive().default(120),
  /** Повторне нагадування про ознайомлення (ТЗ 10). */
  ACK_REMINDER_HOURS: z.coerce.number().int().positive().default(24),
  /** Вікна приходу і відходу відносно планової зміни (ТЗ 18 п. 4). */
  PRESENCE_ARRIVE_BEFORE_MINUTES: z.coerce.number().int().positive().default(180),
  PRESENCE_DEPART_AFTER_MINUTES: z.coerce.number().int().positive().default(180),
  /** Ліміти тимчасових станів і поріг ескалації простою (ТЗ 18 п. 5, 9). */
  BREAK_MINUTES: z.coerce.number().int().positive().default(15),
  MEAL_MINUTES: z.coerce.number().int().positive().default(30),
  SERVICE_TIME_MINUTES: z.coerce.number().int().positive().default(30),
  DOWNTIME_ESCALATION_MINUTES: z.coerce.number().int().positive().default(15),
  /** Пільгове вікно запізнення й раннього відходу; вікно раннього старту без переробки (ТЗ 6.1). */
  SHIFT_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(10),
  EARLY_START_WINDOW_MINUTES: z.coerce.number().int().nonnegative().default(30),
  OVERTIME_THRESHOLD_MINUTES: z.coerce.number().int().nonnegative().default(15),
});

export type Env = z.infer<typeof EnvSchema>;

export function telegramMode(env: Pick<Env, 'TELEGRAM_MODE' | 'NODE_ENV'>): 'webhook' | 'polling' {
  return env.TELEGRAM_MODE ?? (env.NODE_ENV === 'production' ? 'webhook' : 'polling');
}

/** Валідує env один раз при старті; неповна конфігурація зупиняє процес із зрозумілим списком. */
export function loadEnv(source: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некоректна конфігурація середовища: ${issues}`);
  }
  if (
    parsed.data.TELEGRAM_BOT_TOKEN &&
    telegramMode(parsed.data) === 'webhook' &&
    !parsed.data.TELEGRAM_WEBHOOK_SECRET
  ) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET обов'язковий у режимі webhook, коли задано TELEGRAM_BOT_TOKEN (ТЗ 12.2)",
    );
  }
  return parsed.data;
}
