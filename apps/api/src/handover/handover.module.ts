import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
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
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (): HandoverOptions =>
        lateBound(() => {
          const s = currentSettings();
          return { reviewWindowMinutes: s.handoverReviewWindowMinutes };
        }),
    },
  ],
  exports: [HandoverService, MediaModule, HandoverChanges],
})
export class HandoverModule {}
