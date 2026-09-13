import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AdminOverviewController } from './admin-overview.controller.js';
import { OVERVIEW_OPTIONS, OverviewService, type OverviewOptions } from './overview.service.js';

@Module({
  controllers: [AdminOverviewController],
  providers: [
    OverviewService,
    {
      provide: OVERVIEW_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): OverviewOptions => ({
        lateGraceMinutes: config.get('SHIFT_GRACE_MINUTES', { infer: true }),
        closingGraceMinutes: config.get('AUTO_CLOSE_GRACE_MINUTES', { infer: true }),
        downtimeEscalationMinutes: config.get('DOWNTIME_ESCALATION_MINUTES', { infer: true }),
        rotationSeconds: config.get('QR_ROTATION_SECONDS', { infer: true }),
        defaultTimezone: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
})
export class OverviewModule {}
