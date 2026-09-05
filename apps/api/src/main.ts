import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { AUTH } from './auth/auth.service.js';
import { registerAuthRoutes } from './auth/auth.routes.js';
import type { Auth } from './auth/auth.config.js';
import { DomainErrorFilter } from './common/domain-error.js';
import { corsOptions } from './config/cors.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './logger.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);
  const logger = createLogger(env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { logger: ['error', 'warn'] },
  );
  app.enableShutdownHooks();
  app.useGlobalFilters(new DomainErrorFilter());

  // Панель і термінал живуть на інших origin; у продакшені список задається явно.
  // CORS має бути зареєстрований до маршрутів better-auth.
  app.enableCors(corsOptions(env.CORS_ORIGINS));

  registerAuthRoutes(app.getHttpAdapter().getInstance(), app.get<Auth>(AUTH));

  await app.listen(env.API_PORT, env.API_HOST);
  logger.info({ port: env.API_PORT, host: env.API_HOST, cors: env.CORS_ORIGINS }, 'api запущено');
}

bootstrap().catch((error: unknown) => {
  console.error('api не запустилось', error);
  process.exit(1);
});
