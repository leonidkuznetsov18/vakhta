import * as Sentry from '@sentry/node';

export interface SentryEnv {
  readonly SENTRY_DSN?: string | undefined;
  readonly SENTRY_ENVIRONMENT?: string | undefined;
  readonly NODE_ENV: string;
}

/** Ініціалізує Sentry, якщо задано SENTRY_DSN. Воркер не має HTTP, тож нічого зайвого не збирається. */
export function initSentry(env: SentryEnv): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_SHA'],
    serverName: 'worker',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { service: 'worker' } },
  });
  return true;
}

/** Помилка job-а з контекстом черги; дані job-а (ідентифікатори) не є персональними. */
export function reportJobFailure(queue: string, jobId: string | undefined, err: unknown): void {
  Sentry.captureException(err, { tags: { queue }, extra: { jobId } });
}

export { Sentry };
