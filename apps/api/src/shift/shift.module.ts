import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
import { ConfigService } from '@nestjs/config';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { HandoverRepository } from '../handover/handover.repository.js';
import type { Env } from '../config/env.js';
import { AdminShiftsController } from './admin-shifts.controller.js';
import { ShiftChanges } from './shift-changes.js';
import { SHIFT_OPTIONS, ShiftService, type ShiftOptions } from './shift.service.js';
import { ShiftAutoCloseService } from './shift-auto-close.service.js';

@Module({
  imports: [AttendanceModule],
  controllers: [AdminShiftsController],
  providers: [
    ShiftService,
    ShiftAutoCloseService,
    ShiftChanges,
    HandoverRepository,
    {
      provide: SHIFT_OPTIONS,
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (config: ConfigService<Env, true>): ShiftOptions =>
        lateBound(() => {
          const s = currentSettings();
          return {
            breakMinutes: s.breakMinutes,
            mealMinutes: s.mealMinutes,
            serviceTimeMinutes: s.serviceTimeMinutes,
            downtimeEscalationMinutes: s.downtimeEscalationMinutes,
            graceMinutes: s.graceMinutes,
            earlyStartWindowMinutes: s.earlyStartWindowMinutes,
            overtimeThresholdMinutes: s.overtimeThresholdMinutes,
            defaultTimezone: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
            cleaningReminderMinutes: s.cleaningReminderMinutes,
            autoCloseGraceMinutes: s.autoCloseGraceMinutes,
          };
        }),
      inject: [ConfigService],
    },
  ],
  exports: [ShiftService, HandoverRepository, ShiftChanges, SHIFT_OPTIONS],
})
export class ShiftModule {}
