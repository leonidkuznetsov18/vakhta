import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { UpdateTenantBrandingCommand } from '@vakhta/contracts';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BrandingService } from './branding.service.js';

@Controller('control/tenants/:id/branding')
@UseGuards(OperatorGuard)
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}
  @Get()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.branding.get(id);
  }
  @Put()
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTenantBrandingCommand)) command: UpdateTenantBrandingCommand,
    @CurrentOperator() actor: Operator,
  ) {
    return this.branding.update(id, command, actor);
  }
}

@Controller('public/tenant-logo')
export class PublicLogoController {
  constructor(private readonly branding: BrandingService) {}
  @Get(':id/:version')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('X-Content-Type-Options', 'nosniff')
  async logo(@Param('id', ParseUUIDPipe) id: string, @Param('version') version: string) {
    return new StreamableFile(await this.branding.logo(id, version), { type: 'image/webp' });
  }
}
