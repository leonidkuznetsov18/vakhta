import { Module } from '@nestjs/common';
import { MediaModule } from '../handover/media.module.js';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { currentTenant, lateBound } from '../infra/tenant-context.js';
import { DocumentsService } from './documents.service.js';
import { EmergencyService } from './emergency.service.js';
import { EquipmentService } from './equipment.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { MaintenanceScheduler } from './maintenance-scheduler.js';
import { MAINTENANCE_OPTIONS, maintenanceOptionsFrom } from './maintenance-options.js';
import { MechanicWorkService } from './mechanic-work.service.js';
import { PlansService } from './plans.service.js';
import { WorkActionsService } from './work-actions.service.js';
import { WorkQueriesService } from './work-queries.service.js';

/** Equipment maintenance (spec 014): register, manuals, plans, work, calendar and emergencies. */
@Module({
  imports: [ObjectStorageModule, MediaModule],
  controllers: [MaintenanceController],
  providers: [
    {
      provide: MAINTENANCE_OPTIONS,
      // Per-tenant module switch and parameters (spec 014 FR-001, A-4, FR-062), read at use time inside the tenant context.
      useFactory: () =>
        lateBound(() => {
          const runtime = currentTenant();
          return maintenanceOptionsFrom(runtime.settings, runtime.tenant.modules);
        }),
    },
    DocumentsService,
    EmergencyService,
    EquipmentService,
    MaintenanceScheduler,
    MechanicWorkService,
    PlansService,
    WorkActionsService,
    WorkQueriesService,
  ],
  exports: [
    DocumentsService,
    EmergencyService,
    EquipmentService,
    MechanicWorkService,
    WorkActionsService,
    WorkQueriesService,
  ],
})
export class MaintenanceModule {}
