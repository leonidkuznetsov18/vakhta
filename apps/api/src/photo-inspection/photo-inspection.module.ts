import { ChecklistPhotoRulesController } from './checklist-photo-rules.controller.js';
import { ChecklistPhotoRulesService } from './checklist-photo-rules.service.js';
import { PhotoLibraryController } from './photo-library.controller.js';
import { PhotoLibraryService } from './photo-library.service.js';
import { Module } from '@nestjs/common';
import { MediaModule } from '../handover/media.module.js';
import { PhotoInspectionController } from './photo-inspection.controller.js';
import { PhotoInspectionService } from './photo-inspection.service.js';
@Module({
  imports: [MediaModule],
  controllers: [ChecklistPhotoRulesController, PhotoInspectionController, PhotoLibraryController],
  providers: [ChecklistPhotoRulesService, PhotoInspectionService, PhotoLibraryService],
})
export class PhotoInspectionModule {}
