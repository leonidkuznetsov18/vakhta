import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
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
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (): AttendanceOptions =>
        lateBound(() => {
          const s = currentSettings();
          return {
            window: {
              arriveBeforeMinutes: s.arriveBeforeMinutes,
              departAfterMinutes: s.departAfterMinutes,
            },
          };
        }),
    },
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
