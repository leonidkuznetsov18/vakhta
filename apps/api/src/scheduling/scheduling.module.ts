import { ScheduleExportService } from './schedule-export.service.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { OrgModule } from '../org/org.module.js';
import { AdminSchedulesController } from './admin-schedules.controller.js';
import { SCHEDULE_OPTIONS, ScheduleService, type ScheduleOptions } from './schedule.service.js';
import { ScheduleCommandService } from './schedule-command.service.js';
import { TemplatesService } from './templates.service.js';
import { ScheduleHistoryService } from './schedule-history.service.js';
import { StaffingService } from './staffing.service.js';
import { PatternsService } from './patterns.service.js';
import { OpenSlotsService } from './open-slots.service.js';
import { AdminStaffingController } from './admin-staffing.controller.js';

@Module({
  imports: [OrgModule],
  controllers: [AdminSchedulesController, AdminStaffingController],
  providers: [
    TemplatesService,
    ScheduleService,
    ScheduleCommandService,
    ScheduleHistoryService,
    ScheduleExportService,
    StaffingService,
    PatternsService,
    OpenSlotsService,
    {
      provide: SCHEDULE_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): ScheduleOptions => ({
        shiftReminderMinutes: config.get('SHIFT_REMINDER_MINUTES', { infer: true }),
        ackReminderHours: config.get('ACK_REMINDER_HOURS', { infer: true }),
        defaultTimezone: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [ScheduleService, TemplatesService, StaffingService, OpenSlotsService],
})
export class SchedulingModule {}
