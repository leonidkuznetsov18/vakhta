import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
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
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (config: ConfigService<Env, true>): OverviewOptions =>
        lateBound(() => {
          const s = currentSettings();
          return {
            lateGraceMinutes: s.graceMinutes,
            closingGraceMinutes: s.autoCloseGraceMinutes,
            downtimeEscalationMinutes: s.downtimeEscalationMinutes,
            rotationSeconds: s.qrRotationSeconds,
            defaultTimezone: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
          };
        }),
      inject: [ConfigService],
    },
  ],
})
export class OverviewModule {}
