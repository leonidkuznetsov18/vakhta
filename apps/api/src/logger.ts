import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { pino, type Logger, type LoggerOptions } from 'pino';
import type { Options as HttpLoggerOptions } from 'pino-http';
import type { Env } from './config/env.js';

function safeError(error: unknown) {
  return { type: error == null ? 'UnknownError' : 'Error' };
}
export function loggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    base: { service: 'api' },
    serializers: { err: safeError, error: safeError },
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        // Pino derives msg from err.message before serializers; sanitize that implicit path too.
        if (first instanceof Error) {
          method.call(this, { err: first }, 'Operation failed');
        } else if (first && typeof first === 'object' && ('err' in first || 'error' in first)) {
          method.call(this, first, 'Operation failed');
        } else {
          method.apply(this, args);
        }
      },
    },
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'cookie',
        'req.headers',
        'req.body',
        'req.url',
        'res.headers',
      ],
      censor: '[redacted]',
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}
export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino(loggerOptions(env));
}
export function httpLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): HttpLoggerOptions {
  return {
    ...loggerOptions(env),
    genReqId: requestId,
    customProps(request, response) {
      // Fastify assigns raw request.id before Nest middleware; Pino reuses that identity.
      if (!response.headersSent && typeof request.id === 'string')
        response.setHeader('x-request-id', request.id);
      return {};
    },
    serializers: {
      req: (request: { id: string; method: string }) => ({
        id: request.id,
        method: request.method,
      }),
      res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
      err: safeError,
      error: safeError,
    },
  };
}

export function requestId(request: Pick<IncomingMessage, 'headers'>): string {
  const supplied = request.headers['x-request-id'];
  return typeof supplied === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : randomUUID();
}
