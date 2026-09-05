import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
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

  await app.listen(env.API_PORT, env.API_HOST);
  logger.info({ port: env.API_PORT, host: env.API_HOST }, 'api запущено');
}

bootstrap().catch((error: unknown) => {
  console.error('api не запустилось', error);
  process.exit(1);
});
