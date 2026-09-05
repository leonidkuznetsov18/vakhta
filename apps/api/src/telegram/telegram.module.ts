import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';
import { UpdateDedup } from './update-dedup.js';

@Module({
  imports: [IdentityModule, SchedulingModule, AttendanceModule, ShiftModule],
  controllers: [TelegramController],
  providers: [TelegramService, UpdateDedup],
  exports: [TelegramService],
})
export class TelegramModule {}
