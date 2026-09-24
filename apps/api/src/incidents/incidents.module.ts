import { Module } from '@nestjs/common';
import { currentSettings, lateBound } from '../infra/tenant-context.js';
import { MediaModule } from '../handover/media.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ShiftModule } from '../shift/shift.module.js';
import { AdminIncidentsController } from './admin-incidents.controller.js';
import { IncidentChanges } from './incident-changes.js';
import { INCIDENT_OPTIONS, IncidentsService, type IncidentOptions } from './incidents.service.js';

@Module({
  imports: [ShiftModule, MediaModule, MaintenanceModule],
  controllers: [AdminIncidentsController],
  providers: [
    IncidentsService,
    IncidentChanges,
    {
      provide: INCIDENT_OPTIONS,
      // Per-tenant parameters (spec AC-028), read at use time inside the tenant context.
      useFactory: (): IncidentOptions =>
        lateBound(() => {
          const s = currentSettings();
          return {
            sla: {
              normalMinutes: s.incidentSlaNormalMinutes,
              criticalMinutes: s.incidentSlaCriticalMinutes,
              safetyMinutes: s.incidentSlaSafetyMinutes,
            },
          };
        }),
    },
  ],
  exports: [IncidentsService, IncidentChanges],
})
export class IncidentsModule {}
