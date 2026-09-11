import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { SaveChecklistPhotoRules } from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ChecklistPhotoRulesService } from './checklist-photo-rules.service.js';
@Controller('admin/checklists/:definitionId/zones/:zoneId/photo-rules')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER', 'AUDITOR', 'HR')
export class ChecklistPhotoRulesController {
  constructor(private readonly rules: ChecklistPhotoRulesService) {}
  @Get()
  get(
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @CurrentUser() user: WebUser,
  ) {
    return this.rules.get(definitionId, zoneId, user);
  }
  @Put()
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER')
  save(
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body(new ZodValidationPipe(SaveChecklistPhotoRules)) input: SaveChecklistPhotoRules,
    @CurrentUser() user: WebUser,
  ) {
    return this.rules.save(definitionId, zoneId, input, user);
  }
}
