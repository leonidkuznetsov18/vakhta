import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { HandoverModule } from '../handover/handover.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminBonusController } from './admin-bonus.controller.js';
import { BONUS_OPTIONS, BonusService, type BonusOptions } from './bonus.service.js';

@Module({
  imports: [ShiftModule, HandoverModule, IncidentsModule, RequestsModule],
  controllers: [AdminBonusController],
  providers: [
    BonusService,
    {
      provide: BONUS_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): BonusOptions => ({
        appealWindowDays: config.get('APPEAL_WINDOW_DAYS', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [BonusService],
})
export class BonusModule {}
