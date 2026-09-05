import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminHandoverController } from './admin-handover.controller.js';
import { HandoverChanges } from './handover-changes.js';
import { HANDOVER_OPTIONS, HandoverService, type HandoverOptions } from './handover.service.js';
import { MEDIA_OPTIONS, MediaService, type MediaOptions } from './media.service.js';

@Module({
  imports: [ShiftModule, IncidentsModule, ObjectStorageModule],
  controllers: [AdminHandoverController],
  providers: [
    HandoverService,
    MediaService,
    HandoverChanges,
    {
      provide: HANDOVER_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): HandoverOptions => ({
        reviewWindowMinutes: config.get('HANDOVER_REVIEW_WINDOW_MINUTES', { infer: true }),
      }),
      inject: [ConfigService],
    },
    {
      provide: MEDIA_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): MediaOptions => ({
        linkTtlSeconds: config.get('MEDIA_LINK_TTL_SECONDS', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [HandoverService, MediaService],
})
export class HandoverModule {}
