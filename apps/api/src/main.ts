import 'reflect-metadata';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { AUTH } from './auth/auth.service.js';
import { registerAuthRoutes } from './auth/auth.routes.js';
import type { Auth } from './auth/auth.config.js';
import { DomainErrorFilter } from './common/domain-error.js';
import { corsDelegate } from './config/cors.js';
import { bindTenancy } from './infra/tenant-hook.js';
import { loadEnv } from './config/env.js';
import { UnexpectedErrorFilter } from './common/unexpected-error.filter.js';
import { createLogger, requestId } from './logger.js';
import { MetricsService } from './metrics/metrics.module.js';
import { initSentry, Sentry } from './observability/sentry.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);
  const logger = createLogger(env);
  // До створення застосунку, щоб помилки ініціалізації модулів теж потрапили в Sentry.
  const sentry = initSentry(env, 'api');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, genReqId: requestId, trustProxy: true }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } });
  app.enableShutdownHooks();
  // Порядок має значення: Nest перевіряє фільтри з кінця, тож DomainErrorFilter іде останнім.
  app.useGlobalFilters(new UnexpectedErrorFilter(app.getHttpAdapter()), new DomainErrorFilter());

  // Every request is bound to one tenant by its host before CORS, auth routes and Nest routes.
  bindTenancy(app);
  // Панель і термінал живуть на інших origin; у продакшені список задається явно.
  // CORS має бути зареєстрований до маршрутів better-auth.
  app.enableCors(
    corsDelegate(env.CORS_ORIGINS, env.PUBLIC_BASE_URL.startsWith('https://') ? 'https' : 'http'),
  );

  registerAuthRoutes(app.getHttpAdapter().getInstance(), app.get<Auth>(AUTH));

  // Метрики тривалості запитів за маршрутом, без параметрів шляху (ТЗ 12, NFR-01).
  const metrics = app.get(MetricsService);
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    metrics.observe(request.method, route, reply.statusCode, reply.elapsedTime / 1000);
    done();
  });

  await app.listen(env.API_PORT, env.API_HOST);
  logger.info(
    { port: env.API_PORT, host: env.API_HOST, cors: env.CORS_ORIGINS, sentry },
    'api запущено',
  );
}

bootstrap().catch(async (error: unknown) => {
  console.error('api не запустилось', error);
  Sentry.captureException(error);
  await Sentry.flush(2000);
  process.exit(1);
});
