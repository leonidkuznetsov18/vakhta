import { configureControlCors } from './public/cors.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { AUTH, type ControlAuth } from './auth/auth.module.js';
import { registerControlAuthRoutes } from './auth/auth.routes.js';
import { ControlErrorFilter } from './common/domain-error.js';
import { loadControlEnv } from './config/env.js';
import { createLogger } from './logger.js';

async function bootstrap(): Promise<void> {
  const env = loadControlEnv(process.env);
  const logger = createLogger(env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
    {
      bufferLogs: false,
      logger: env.NODE_ENV === 'development' ? ['log', 'warn', 'error'] : ['warn', 'error'],
    },
  );
  app.enableShutdownHooks();
  app.useGlobalFilters(new ControlErrorFilter());
  configureControlCors(app, env);
  registerControlAuthRoutes(app.getHttpAdapter().getInstance(), app.get<ControlAuth>(AUTH));
  await app.listen(env.CONTROL_PORT, env.CONTROL_HOST);
  logger.info({ port: env.CONTROL_PORT, host: env.CONTROL_HOST }, 'control-api started');
}

bootstrap().catch((error: unknown) => {
  console.error('control-api failed to start', error);
  process.exit(1);
});
