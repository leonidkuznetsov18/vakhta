import { Module } from '@nestjs/common';
import { MediaModule } from '../handover/media.module.js';
import { PhotoInspectionController } from './photo-inspection.controller.js';
import { PhotoInspectionService } from './photo-inspection.service.js';
@Module({
  imports: [MediaModule],
  controllers: [PhotoInspectionController],
  providers: [PhotoInspectionService],
})
export class PhotoInspectionModule {}
