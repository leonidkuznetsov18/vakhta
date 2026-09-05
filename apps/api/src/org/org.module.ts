import { Module } from '@nestjs/common';
import { AdminOrgController } from './admin-org.controller.js';
import { OrgService } from './org.service.js';

@Module({
  controllers: [AdminOrgController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
