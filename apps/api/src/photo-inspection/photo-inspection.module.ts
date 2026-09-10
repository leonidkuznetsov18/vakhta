import { PhotoLibraryController } from './photo-library.controller.js';
import { PhotoLibraryService } from './photo-library.service.js';
import { Module } from '@nestjs/common';
import { MediaModule } from '../handover/media.module.js';
import { PhotoInspectionController } from './photo-inspection.controller.js';
import { PhotoInspectionService } from './photo-inspection.service.js';
@Module({
  imports: [MediaModule],
  controllers: [PhotoInspectionController, PhotoLibraryController],
  providers: [PhotoInspectionService, PhotoLibraryService],
})
export class PhotoInspectionModule {}
