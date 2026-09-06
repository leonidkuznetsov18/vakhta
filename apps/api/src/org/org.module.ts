import { Module } from '@nestjs/common';
import { AdminOrgController } from './admin-org.controller.js';
import { ChecklistsService } from './checklists.service.js';
import { OrgService } from './org.service.js';

@Module({
  controllers: [AdminOrgController],
  providers: [OrgService, ChecklistsService],
  exports: [OrgService, ChecklistsService],
})
export class OrgModule {}
