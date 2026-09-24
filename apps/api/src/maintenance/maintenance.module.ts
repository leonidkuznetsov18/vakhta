import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { DocumentsService } from './documents.service.js';
import { EmergencyService } from './emergency.service.js';
import { EquipmentService } from './equipment.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { MaintenanceScheduler } from './maintenance-scheduler.js';
import { PlansService } from './plans.service.js';
import { WorkActionsService } from './work-actions.service.js';
import { WorkQueriesService } from './work-queries.service.js';

/** Equipment maintenance (spec 014): register, manuals, plans, work, calendar and emergencies. */
@Module({
  imports: [ObjectStorageModule],
  controllers: [MaintenanceController],
  providers: [
    DocumentsService,
    EmergencyService,
    EquipmentService,
    MaintenanceScheduler,
    PlansService,
    WorkActionsService,
    WorkQueriesService,
  ],
  exports: [
    DocumentsService,
    EmergencyService,
    EquipmentService,
    WorkActionsService,
    WorkQueriesService,
  ],
})
export class MaintenanceModule {}
