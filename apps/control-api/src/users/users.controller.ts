import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { TenantUserCountsQuery, TenantUsersQuery } from '@vakhta/contracts';
import { OperatorGuard } from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { TenantUsersService } from './users.service.js';

@Controller('control/tenant-users')
@UseGuards(OperatorGuard)
export class TenantUsersController {
  constructor(private readonly users: TenantUsersService) {}

  @Get('counts')
  @Header('Cache-Control', 'no-store')
  counts(@Query(new ZodValidationPipe(TenantUserCountsQuery)) query: { ids: string[] }) {
    return this.users.counts(query.ids);
  }

  @Get(':tenantId')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query(new ZodValidationPipe(TenantUsersQuery)) query: TenantUsersQuery,
  ) {
    return this.users.list(tenantId, query);
  }

  @Get(':tenantId/avatars/:employeeId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'image/webp')
  @Header('X-Content-Type-Options', 'nosniff')
  async avatar(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return new StreamableFile(await this.users.avatar(tenantId, employeeId));
  }
}
