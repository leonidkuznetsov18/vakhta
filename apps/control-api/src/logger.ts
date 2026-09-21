import { pino, type Logger, type LoggerOptions } from 'pino';
import type { ControlEnv } from './config/env.js';

function safeError(error: unknown) {
  return { type: error == null ? 'UnknownError' : 'Error' };
}

/** Never logs a bot token, database URL or provider token: errors are reduced to their type. */
export function loggerOptions(env: Pick<ControlEnv, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    base: { service: 'control-api' },
    serializers: { err: safeError, error: safeError },
    redact: {
      paths: [
        'password',
        'token',
        'botToken',
        'databaseUrl',
        'authorization',
        'cookie',
        'req.headers',
        'req.body',
      ],
      censor: '[redacted]',
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}

export function createLogger(env: Pick<ControlEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino(loggerOptions(env));
}
