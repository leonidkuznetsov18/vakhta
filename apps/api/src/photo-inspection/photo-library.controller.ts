import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PhotoLibraryQuery } from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { PhotoLibraryService } from './photo-library.service.js';

@Controller('admin/photo-inspections')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER', 'HR', 'AUDITOR')
export class PhotoLibraryController {
  constructor(private readonly library: PhotoLibraryService) {}
  @Get()
  list(
    @Query(new ZodValidationPipe(PhotoLibraryQuery)) query: PhotoLibraryQuery,
    @CurrentUser() user: WebUser,
  ) {
    return this.library.list(query, user);
  }
}
