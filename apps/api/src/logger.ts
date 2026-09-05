import { pino, type Logger } from 'pino';
import type { Env } from './config/env.js';

/** Структуровані логи (NFR-09). Токени, секрети і підписані URL сюди не потрапляють. */
export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers["x-telegram-bot-api-secret-token"]'],
      censor: '[redacted]',
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
