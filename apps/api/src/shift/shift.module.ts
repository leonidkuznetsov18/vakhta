import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { HandoverRepository } from '../handover/handover.repository.js';
import type { Env } from '../config/env.js';
import { AdminShiftsController } from './admin-shifts.controller.js';
import { ShiftChanges } from './shift-changes.js';
import { SHIFT_OPTIONS, ShiftService, type ShiftOptions } from './shift.service.js';

@Module({
  imports: [AttendanceModule],
  controllers: [AdminShiftsController],
  providers: [
    ShiftService,
    ShiftChanges,
    HandoverRepository,
    {
      provide: SHIFT_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): ShiftOptions => ({
        breakMinutes: config.get('BREAK_MINUTES', { infer: true }),
        mealMinutes: config.get('MEAL_MINUTES', { infer: true }),
        serviceTimeMinutes: config.get('SERVICE_TIME_MINUTES', { infer: true }),
        downtimeEscalationMinutes: config.get('DOWNTIME_ESCALATION_MINUTES', { infer: true }),
        graceMinutes: config.get('SHIFT_GRACE_MINUTES', { infer: true }),
        earlyStartWindowMinutes: config.get('EARLY_START_WINDOW_MINUTES', { infer: true }),
        overtimeThresholdMinutes: config.get('OVERTIME_THRESHOLD_MINUTES', { infer: true }),
        defaultTimezone: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
        cleaningReminderMinutes: config.get('CLEANING_REMINDER_MINUTES', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [ShiftService, HandoverRepository, ShiftChanges, SHIFT_OPTIONS],
})
export class ShiftModule {}
