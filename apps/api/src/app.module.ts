import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { loadEnv } from './config/env.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { KioskModule } from './kiosk/kiosk.module.js';
import { OrgModule } from './org/org.module.js';
import { TelegramModule } from './telegram/telegram.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config) => loadEnv(config),
    }),
    DatabaseModule,
    RedisModule,
    EventsModule,
    AuthModule,
    HealthModule,
    OrgModule,
    IdentityModule,
    KioskModule,
    TelegramModule,
  ],
})
export class AppModule {}
