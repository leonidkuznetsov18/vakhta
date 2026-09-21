import { z } from 'zod';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SetTenantAdministratorPassword, TenantAdministratorsQuery } from '@vakhta/contracts';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdministratorsService } from './administrators.service.js';

const TargetParams = z.object({ tenantId: z.uuid(), userId: z.uuid() });

@Controller('control/tenants/:tenantId/administrators')
@UseGuards(OperatorGuard)
export class AdministratorsController {
  constructor(private readonly administrators: AdministratorsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query(new ZodValidationPipe(TenantAdministratorsQuery)) query: { page: number },
  ) {
    return this.administrators.list(tenantId, query.page);
  }

  @Put(':userId/password')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  async password(
    @Param(new ZodValidationPipe(TargetParams)) params: z.infer<typeof TargetParams>,
    @Body(new ZodValidationPipe(SetTenantAdministratorPassword))
    command: SetTenantAdministratorPassword,
    @CurrentOperator() actor: Operator,
  ) {
    await this.administrators.setPassword({ ...params, actor }, command);
    return { ok: true };
  }

  @Delete(':userId')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  async remove(
    @Param(new ZodValidationPipe(TargetParams)) params: z.infer<typeof TargetParams>,
    @CurrentOperator() actor: Operator,
  ) {
    await this.administrators.remove({ ...params, actor });
    return { ok: true };
  }
}
