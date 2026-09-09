import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { OrgModule } from '../org/org.module.js';
import { AdminSchedulesController } from './admin-schedules.controller.js';
import { SCHEDULE_OPTIONS, ScheduleService, type ScheduleOptions } from './schedule.service.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [OrgModule],
  controllers: [AdminSchedulesController],
  providers: [
    TemplatesService,
    ScheduleService,
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
  exports: [ScheduleService, TemplatesService],
})
export class SchedulingModule {}
