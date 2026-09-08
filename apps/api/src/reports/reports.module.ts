import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller.js';
import { LossesService } from './losses.service.js';
import { ReportsService } from './reports.service.js';

@Module({
  controllers: [AdminReportsController],
  providers: [ReportsService, LossesService],
  exports: [ReportsService, LossesService],
})
export class ReportsModule {}
