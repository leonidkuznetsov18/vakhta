import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsoDateTime } from '@vakhta/contracts';
import { CurrentUser, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { EmployeeAvatarService } from './employee-avatar.service.js';

@Controller('admin/employees/:id/avatar')
@UseGuards(WebAuthGuard)
export class EmployeeAvatarController {
  constructor(private readonly avatars: EmployeeAvatarService) {}
  @Get()
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
    @Res() reply: FastifyReply,
  ) {
    const url = await this.avatars.get(id, user);
    return reply.header('Cache-Control', 'private, no-store').redirect(url, 302);
  }
  @Put()
  async put(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string,
    @Req() request: FastifyRequest,
    @CurrentUser() user: WebUser,
  ) {
    const parsed = IsoDateTime.safeParse(version);
    if (!parsed.success)
      throw new DomainError('EMPLOYEE_VERSION_REQUIRED', 400, 'Employee version required');
    const file = await request.file();
    if (!file) throw new DomainError('AVATAR_INVALID', 400, 'Avatar file required');
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw new DomainError('AVATAR_TOO_LARGE', 413, 'Avatar exceeds 10 MB');
    }
    return this.avatars.save(id, bytes, parsed.data, user);
  }
  @Delete()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string,
    @CurrentUser() user: WebUser,
  ) {
    const parsed = IsoDateTime.safeParse(version);
    if (!parsed.success)
      throw new DomainError('EMPLOYEE_VERSION_REQUIRED', 400, 'Employee version required');
    return this.avatars.save(id, null, parsed.data, user);
  }
}
