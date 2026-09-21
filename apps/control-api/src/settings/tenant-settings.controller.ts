import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { UpdateTenantSettingsCommand, type TenantSettingsView } from '@vakhta/contracts';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { TenantSettingsService } from './tenant-settings.service.js';

/** The Parameters tab: viewers read, platform administrators change. */
@Controller('control/tenants/:id/settings')
@UseGuards(OperatorGuard)
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TenantSettingsView> {
    return this.settings.get(id);
  }

  @Put()
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTenantSettingsCommand)) body: UpdateTenantSettingsCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantSettingsView> {
    return this.settings.update(id, body, operator);
  }
}
