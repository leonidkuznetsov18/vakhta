import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BonusModule } from './bonus/bonus.module.js';
import { loadEnv } from './config/env.js';
import { EventsModule } from './events/events.module.js';
import { HandoverModule } from './handover/handover.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { QueueModule } from './infra/timers.queue.js';
import { KioskModule } from './kiosk/kiosk.module.js';
import { NotificationsModule } from './notifications/notifications.service.js';
import { OrgModule } from './org/org.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { ShiftModule } from './shift/shift.module.js';
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
    QueueModule,
    EventsModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    OrgModule,
    IdentityModule,
    SchedulingModule,
    AttendanceModule,
    ShiftModule,
    IncidentsModule,
    HandoverModule,
    RequestsModule,
    BonusModule,
    ReportsModule,
    KioskModule,
    TelegramModule,
  ],
})
export class AppModule {}
