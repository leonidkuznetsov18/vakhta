import { CommunicationsModule } from './communications/communications.module.js';
import { PhotoInspectionModule } from './photo-inspection/photo-inspection.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { httpLoggerOptions } from './logger.js';
import type { Env } from './config/env.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BonusModule } from './bonus/bonus.module.js';
import { loadEnv } from './config/env.js';
import { EventsModule } from './events/events.module.js';
import { HandoverModule } from './handover/handover.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { QueueModule } from './infra/timers.queue.js';
import { TenancyModule } from './infra/tenancy.module.js';
import { KioskModule } from './kiosk/kiosk.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { NotificationsModule } from './notifications/notifications.service.js';
import { OrgModule } from './org/org.module.js';
import { OverviewModule } from './overview/overview.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { ShiftModule } from './shift/shift.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { SupportModule } from './support/support.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config) => loadEnv(config),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: httpLoggerOptions({
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
        }),
      }),
    }),
    RedisModule,
    TenancyModule,
    DatabaseModule,
    QueueModule,
    EventsModule,
    NotificationsModule,
    CommunicationsModule,
    AuthModule,
    HealthModule,
    MetricsModule,
    OrgModule,
    IdentityModule,
    SchedulingModule,
    AttendanceModule,
    ShiftModule,
    IncidentsModule,
    MaintenanceModule,
    OverviewModule,
    HandoverModule,
    PhotoInspectionModule,
    RequestsModule,
    BonusModule,
    ReportsModule,
    KioskModule,
    TelegramModule,
    SupportModule,
  ],
})
export class AppModule {}
