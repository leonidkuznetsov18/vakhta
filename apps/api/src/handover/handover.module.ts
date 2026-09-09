import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminHandoverController } from './admin-handover.controller.js';
import { HandoverChanges } from './handover-changes.js';
import { HANDOVER_OPTIONS, HandoverService, type HandoverOptions } from './handover.service.js';
import { MediaModule } from './media.module.js';

@Module({
  imports: [ShiftModule, IncidentsModule, MediaModule],
  controllers: [AdminHandoverController],
  providers: [
    HandoverService,
    HandoverChanges,
    {
      provide: HANDOVER_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): HandoverOptions => ({
        reviewWindowMinutes: config.get('HANDOVER_REVIEW_WINDOW_MINUTES', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [HandoverService, MediaModule, HandoverChanges],
})
export class HandoverModule {}
