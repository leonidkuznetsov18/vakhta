import * as Sentry from '@sentry/node';

export interface SentryEnv {
  readonly SENTRY_DSN?: string | undefined;
  readonly SENTRY_ENVIRONMENT?: string | undefined;
  readonly NODE_ENV: string;
}

/** Заголовки, які ніколи не мають потрапити в Sentry (CLAUDE.md: токени, секрети, cookie сесій). */
const SECRET_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-telegram-bot-api-secret-token'];

/**
 * Прибирає секрети з події перед відправкою. Чиста функція, щоб її можна було
 * протестувати без Sentry: `sendDefaultPii: false` не прибирає власні заголовки запиту.
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SECRET_HEADERS.includes(key.toLowerCase())) headers[key] = '[redacted]';
    }
  }
  if (event.request?.cookies) delete event.request.cookies;
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
  }
  return event;
}

/** Ініціалізує Sentry, якщо задано SENTRY_DSN. Повертає true, коли звіти ввімкнені. */
export function initSentry(env: SentryEnv, service: 'api' | 'worker'): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_SHA'],
    serverName: service,
    sendDefaultPii: false,
    // Лише помилки: трейси й профілі не потрібні на пілоті, а метрики є в /metrics.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    initialScope: { tags: { service } },
  });
  return true;
}

export { Sentry };
