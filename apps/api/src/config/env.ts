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
  /** Outgoing mail for activation cards: smtp(s)://user:pass@host:port; without it e-mail sending is off. */
  SMTP_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Sender shown to employees, e.g. "Вахта <noreply@vakhta.xyz>". */
  MAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  MAIL_REPLY_TO: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  /** Public address of the user guide; the bot offers it under /help and the Help button. */
  USER_GUIDE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** webhook для продакшену (потрібна публічна адреса), polling для розробки. За замовчуванням залежить від NODE_ENV. */
  TELEGRAM_MODE: z.preprocess(emptyToUndefined, z.enum(['webhook', 'polling']).optional()),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /** Support assistant bot (docs/features/12-support-bot.md): a second bot with its own webhook secret. */
  TELEGRAM_SUPPORT_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  TELEGRAM_SUPPORT_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /** Username of the support bot; the worker bot shows a "Support" button when set. */
  SUPPORT_BOT_USERNAME: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPPORT_MODEL: z.string().default('claude-sonnet-5'),
  /** Voice questions and answers of the support bot; without the key the bot answers in text only. */
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Folder with features/*.md, the user guide and CHANGELOG.md; the Docker image sets it. */
  SUPPORT_KNOWLEDGE_DIR: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Telegram user ids allowed to use the assistant without an employee link. */
  SUPPORT_ALLOWED_TELEGRAM_IDS: commaList.default([]),
  SUPPORT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(40),
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
  MEAL_MINUTES: z.coerce.number().int().positive().default(60),
  SERVICE_TIME_MINUTES: z.coerce.number().int().positive().default(30),
  DOWNTIME_ESCALATION_MINUTES: z.coerce.number().int().positive().default(15),
  /** Пільгове вікно запізнення й раннього відходу; вікно раннього старту без переробки (ТЗ 6.1). */
  SHIFT_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(10),
  EARLY_START_WINDOW_MINUTES: z.coerce.number().int().nonnegative().default(30),
  OVERTIME_THRESHOLD_MINUTES: z.coerce.number().int().nonnegative().default(15),
  /** SLA реакції майстра на інцидент за критичністю; безпека негайно (FR-DWN-03). */
  INCIDENT_SLA_NORMAL_MINUTES: z.coerce.number().int().nonnegative().default(60),
  INCIDENT_SLA_CRITICAL_MINUTES: z.coerce.number().int().nonnegative().default(30),
  INCIDENT_SLA_SAFETY_MINUTES: z.coerce.number().int().nonnegative().default(0),
  /** Вікно, в якому повідомлення тієї ж зони й причини лінкуються до одного інциденту (FR-DWN-04). */
  INCIDENT_DUPLICATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  /** Нагадування про прибирання до планового кінця (FR-CLN-01); вікно приймання (ТЗ 18 п. 11). */
  CLEANING_REMINDER_MINUTES: z.coerce.number().int().positive().default(30),
  HANDOVER_REVIEW_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  /** Приватне сховище фото (ADR-0006). Без S3_BUCKET посилання на фото недоступні. */
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_FORCE_PATH_STYLE: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .default(true),
  MEDIA_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Строк апеляції по балах у робочих днях (ТЗ 7.7, 18 п. 14). */
  APPEAL_WINDOW_DAYS: z.coerce.number().int().positive().default(3),
  /** Bearer-токен для GET /metrics; у продакшені обовʼязковий, щоб ендпоінт не був відкритим (ТЗ 12). */
  METRICS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /** SameSite cookie сесії панелі: lax, коли панель і API під одним доменом; none лише для різних сайтів. */
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'none']).default('lax'),
  /** DSN Sentry; порожньо = вимкнено. */
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
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
  if (
    parsed.data.TELEGRAM_SUPPORT_BOT_TOKEN &&
    telegramMode(parsed.data) === 'webhook' &&
    !parsed.data.TELEGRAM_SUPPORT_WEBHOOK_SECRET
  ) {
    throw new Error(
      'TELEGRAM_SUPPORT_WEBHOOK_SECRET is required in webhook mode when TELEGRAM_SUPPORT_BOT_TOKEN is set',
    );
  }
  assertProductionReady(parsed.data);
  return parsed.data;
}

const PLACEHOLDER = /change-me|example|^dev-|^vakhta/i;

/**
 * У NODE_ENV=production неповна або тестова конфігурація зупиняє процес до відкриття порту:
 * дешевше впасти на деплої, ніж виявити відкритий /metrics або polling бота в проді.
 */
export function assertProductionReady(env: Env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.PUBLIC_BASE_URL.startsWith('https://')) problems.push('PUBLIC_BASE_URL має бути https');
  for (const origin of env.CORS_ORIGINS) {
    if (!origin.startsWith('https://')) problems.push(`CORS_ORIGINS: ${origin} має бути https`);
  }
  if (telegramMode(env) !== 'webhook') problems.push('TELEGRAM_MODE має бути webhook');
  if (!env.TELEGRAM_BOT_TOKEN) problems.push('TELEGRAM_BOT_TOKEN обовʼязковий');
  if (!env.TELEGRAM_WEBHOOK_SECRET) problems.push('TELEGRAM_WEBHOOK_SECRET обовʼязковий');
  if (PLACEHOLDER.test(env.AUTH_SECRET)) problems.push('AUTH_SECRET схожий на заглушку');
  if (PLACEHOLDER.test(env.ACTIVATION_PEPPER))
    problems.push('ACTIVATION_PEPPER схожий на заглушку');
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    problems.push(
      'S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY обовʼязкові: без сховища фото передач не працюють',
    );
  } else if (PLACEHOLDER.test(env.S3_SECRET_KEY)) {
    problems.push('S3_SECRET_KEY схожий на заглушку');
  }
  if (!env.METRICS_TOKEN)
    problems.push('METRICS_TOKEN обовʼязковий: /metrics не можна лишати відкритим');
  if (problems.length > 0) {
    throw new Error(`Конфігурація не готова до продакшену: ${problems.join('; ')}`);
  }
}
