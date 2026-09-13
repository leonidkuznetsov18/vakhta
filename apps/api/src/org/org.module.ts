import { UnitMasterController } from './unit-master.controller.js';
import { UnitMasterService } from './unit-master.service.js';
import { Module } from '@nestjs/common';
import { AdminOrgController } from './admin-org.controller.js';
import { ChecklistsService } from './checklists.service.js';
import { OrgService } from './org.service.js';

@Module({
  controllers: [AdminOrgController, UnitMasterController],
  providers: [OrgService, ChecklistsService, UnitMasterService],
  exports: [OrgService, ChecklistsService],
})
export class OrgModule {}
