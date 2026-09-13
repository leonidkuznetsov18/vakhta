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
import { assertInScope, scopeOf } from '../common/access-scope.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { EMPLOYEE_READERS, EMPLOYEE_WRITERS } from './admin-employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { PositionsService } from './positions.service.js';

@Controller('admin/employees/:id/positions')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'HR')
@UseFilters(IdentityExceptionFilter)
export class AdminPositionsController {
  constructor(
    private readonly positions: PositionsService,
    private readonly employees: EmployeesService,
  ) {}

  @Get()
  @Roles('ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeePositionView[]> {
    const scope = scopeOf(user, EMPLOYEE_READERS);
    if (!scope.all) assertInScope(scope, await this.employees.placeOf(id));
    return this.positions.history(id);
  }

  @Post()
  @HttpCode(201)
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignPositionCommand)) body: AssignPositionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeePositionView> {
    // A scoped HR moves people only within their scope: both the current and the new place.
    const scope = scopeOf(user, EMPLOYEE_WRITERS);
    if (!scope.all) {
      assertInScope(scope, await this.employees.placeOf(id));
      await this.employees.assertPlaceInScope(scope, body.orgUnitId, body.teamId ?? null);
    }
    return this.positions.assign(id, body, webUserActor(user), scope);
  }
}
