import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AdminAttendanceController } from './admin-attendance.controller.js';
import {
  ATTENDANCE_OPTIONS,
  AttendanceService,
  type AttendanceOptions,
} from './attendance.service.js';

@Module({
  controllers: [AdminAttendanceController],
  providers: [
    AttendanceService,
    {
      provide: ATTENDANCE_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): AttendanceOptions => ({
        window: {
          arriveBeforeMinutes: config.get('PRESENCE_ARRIVE_BEFORE_MINUTES', { infer: true }),
          departAfterMinutes: config.get('PRESENCE_DEPART_AFTER_MINUTES', { infer: true }),
        },
      }),
      inject: [ConfigService],
    },
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
