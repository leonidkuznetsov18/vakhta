import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestInspectionAnalysis, SaveInspection } from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { PhotoInspectionService } from './photo-inspection.service.js';

@Controller('admin/handovers/:handoverId/photos/:mediaId/:itemKey/inspection')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER', 'HR', 'AUDITOR')
export class PhotoInspectionController {
  constructor(private readonly inspections: PhotoInspectionService) {}
  @Get()
  get(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.get({ handoverId, mediaId, itemKey }, user);
  }
  @Get('limits')
  limits(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.analysisLimits({ handoverId, mediaId, itemKey }, user);
  }
  @Get('link')
  link(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.link({ handoverId, mediaId, itemKey }, user);
  }
  @Get('export')
  export(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.export({ handoverId, mediaId, itemKey }, user);
  }
  @Post()
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER')
  save(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @Body(new ZodValidationPipe(SaveInspection)) body: SaveInspection,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.save({ handoverId, mediaId, itemKey }, body, user);
  }
  @Post('analyze')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER')
  analyze(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('itemKey') itemKey: string,
    @Body(new ZodValidationPipe(RequestInspectionAnalysis)) body: RequestInspectionAnalysis,
    @CurrentUser() user: WebUser,
  ) {
    return this.inspections.analyze({ handoverId, mediaId, itemKey }, body, user);
  }
}
