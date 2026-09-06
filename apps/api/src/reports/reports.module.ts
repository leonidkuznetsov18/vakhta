import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  controllers: [AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
