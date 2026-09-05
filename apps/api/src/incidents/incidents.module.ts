import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminIncidentsController } from './admin-incidents.controller.js';
import { IncidentChanges } from './incident-changes.js';
import { INCIDENT_OPTIONS, IncidentsService, type IncidentOptions } from './incidents.service.js';

@Module({
  imports: [ShiftModule],
  controllers: [AdminIncidentsController],
  providers: [
    IncidentsService,
    IncidentChanges,
    {
      provide: INCIDENT_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): IncidentOptions => ({
        sla: {
          normalMinutes: config.get('INCIDENT_SLA_NORMAL_MINUTES', { infer: true }),
          criticalMinutes: config.get('INCIDENT_SLA_CRITICAL_MINUTES', { infer: true }),
          safetyMinutes: config.get('INCIDENT_SLA_SAFETY_MINUTES', { infer: true }),
        },
        duplicateWindowMinutes: config.get('INCIDENT_DUPLICATE_WINDOW_MINUTES', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [IncidentsService],
})
export class IncidentsModule {}
