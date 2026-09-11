import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CreatePhotoObject } from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { PhotoObjectsService } from './photo-objects.service.js';

@Controller('admin/photo-objects')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER', 'AUDITOR', 'HR')
export class PhotoObjectsController {
  constructor(private readonly objects: PhotoObjectsService) {}
  @Get()
  list(@CurrentUser() user: WebUser) {
    return this.objects.list(user);
  }
  @Post()
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER')
  create(
    @Body(new ZodValidationPipe(CreatePhotoObject)) input: CreatePhotoObject,
    @CurrentUser() user: WebUser,
  ) {
    return this.objects.create(input, user);
  }
}
