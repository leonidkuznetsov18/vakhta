import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AddCompensationEntryCommand, CompensationQuery } from '@vakhta/contracts';
import { CurrentUser, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import { EmployeeCompensationService } from './employee-compensation.service.js';

/** Role and grant checks live in services so denied compensation reads are audited too. */
@Controller('admin/employees/:id')
@UseGuards(WebAuthGuard)
export class EmployeeProfileController {
  constructor(
    private readonly profile: EmployeeProfileService,
    private readonly compensation: EmployeeCompensationService,
  ) {}
  @Get('profile')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: WebUser) {
    return this.profile.get(id, user);
  }
  @Get('compensation')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(CompensationQuery)) query: { asOf?: string },
    @CurrentUser() user: WebUser,
  ) {
    return this.compensation.get(id, user, query.asOf);
  }
  @Post('compensation')
  add(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddCompensationEntryCommand)) body: AddCompensationEntryCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.compensation.add(id, body, user);
  }
}
