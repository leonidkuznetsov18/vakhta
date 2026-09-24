import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
import { HandoverModule } from '../handover/handover.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminRequestsController } from './admin-requests.controller.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';
import { REQUESTS_OPTIONS, RequestsService, type RequestsOptions } from './requests.service.js';

@Module({
  imports: [SchedulingModule, ShiftModule, HandoverModule],
  controllers: [AdminRequestsController],
  providers: [
    RequestsService,
    CorrectionsService,
    RequestChanges,
    {
      provide: REQUESTS_OPTIONS,
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (): RequestsOptions =>
        lateBound(() => ({ appealWindowDays: currentSettings().appealWindowDays })),
    },
  ],
  exports: [RequestsService, CorrectionsService, RequestChanges],
})
export class RequestsModule {}
