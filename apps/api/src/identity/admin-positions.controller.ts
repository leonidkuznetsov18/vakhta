import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AssignPositionCommand, type EmployeePositionView } from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { PositionsService } from './positions.service.js';

@Controller('admin/employees/:id/positions')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'HR')
@UseFilters(IdentityExceptionFilter)
export class AdminPositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @Roles('ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  history(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeePositionView[]> {
    return this.positions.history(id);
  }

  @Post()
  @HttpCode(201)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignPositionCommand)) body: AssignPositionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeePositionView> {
    return this.positions.assign(id, body, webUserActor(user));
  }
}
