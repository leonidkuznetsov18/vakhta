import { Body, Controller, Delete, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { SetUnitMasterCommand } from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { UnitMasterService } from './unit-master.service.js';

@Controller('admin/org/units/:id/master')
@UseGuards(WebAuthGuard)
@Roles('ADMIN')
export class UnitMasterController {
  constructor(private readonly masters: UnitMasterService) {}
  @Put()
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetUnitMasterCommand)) body: SetUnitMasterCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.masters.set(id, body.employeeId, user);
  }
  @Delete()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: WebUser) {
    return this.masters.set(id, null, user);
  }
}
