import { ConfigService } from '@nestjs/config';
import { PHOTO_ANALYSIS_CONFIG, PhotoAnalysisConfigSchema } from '../config/photo-analysis.js';
import type { Env } from '../config/env.js';
import { ChecklistPhotoRulesController } from './checklist-photo-rules.controller.js';
import { ChecklistPhotoRulesService } from './checklist-photo-rules.service.js';
import { PhotoLibraryController } from './photo-library.controller.js';
import { PhotoLibraryService } from './photo-library.service.js';
import { PhotoObjectsController } from './photo-objects.controller.js';
import { PhotoObjectsService } from './photo-objects.service.js';
import { Module } from '@nestjs/common';
import { MediaModule } from '../handover/media.module.js';
import { PhotoInspectionController } from './photo-inspection.controller.js';
import { PhotoInspectionService } from './photo-inspection.service.js';
@Module({
  imports: [MediaModule],
  controllers: [
    ChecklistPhotoRulesController,
    PhotoInspectionController,
    PhotoLibraryController,
    PhotoObjectsController,
  ],
  providers: [
    {
      provide: PHOTO_ANALYSIS_CONFIG,
      useFactory: (config: ConfigService<Env, true>) =>
        PhotoAnalysisConfigSchema.parse({
          PHOTO_INSPECTION_PER_PHOTO_LIMIT: config.get('PHOTO_INSPECTION_PER_PHOTO_LIMIT', {
            infer: true,
          }),
          PHOTO_INSPECTION_GLOBAL_LIMIT: config.get('PHOTO_INSPECTION_GLOBAL_LIMIT', {
            infer: true,
          }),
          PHOTO_INSPECTION_WINDOW_HOURS: config.get('PHOTO_INSPECTION_WINDOW_HOURS', {
            infer: true,
          }),
        }),
      inject: [ConfigService],
    },
    ChecklistPhotoRulesService,
    PhotoInspectionService,
    PhotoLibraryService,
    PhotoObjectsService,
  ],
})
export class PhotoInspectionModule {}
