import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { HandoverModule } from '../handover/handover.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminBonusController } from './admin-bonus.controller.js';
import { BonusMonthCloseService } from './bonus-month-close.service.js';
import { BonusBackgroundService } from './bonus-background.service.js';
import { BonusMonthService } from './bonus-month.service.js';
import { BONUS_OPTIONS, BonusService, type BonusOptions } from './bonus.service.js';

@Module({
  imports: [ShiftModule, HandoverModule, IncidentsModule, RequestsModule],
  controllers: [AdminBonusController],
  providers: [
    BonusService,
    BonusBackgroundService,
    BonusMonthService,
    BonusMonthCloseService,
    {
      provide: BONUS_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): BonusOptions => ({
        appealWindowDays: config.get('APPEAL_WINDOW_DAYS', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [BonusService, BonusMonthService],
})
export class BonusModule {}
