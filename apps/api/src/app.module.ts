import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { TelegramModule } from './telegram/telegram.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config) => loadEnv(config),
    }),
    HealthModule,
    TelegramModule,
  ],
})
export class AppModule {}
