import { Module } from '@nestjs/common';
import { HandoverModule } from '../handover/handover.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminRequestsController } from './admin-requests.controller.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [SchedulingModule, ShiftModule, HandoverModule],
  controllers: [AdminRequestsController],
  providers: [RequestsService, CorrectionsService, RequestChanges],
  exports: [RequestsService, CorrectionsService],
})
export class RequestsModule {}
