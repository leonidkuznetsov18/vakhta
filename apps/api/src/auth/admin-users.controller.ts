import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateWebUserCommand,
  GrantRoleCommand,
  type MeView,
  type RoleGrantView,
  type WebUserView,
} from '@vakhta/contracts';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { RolesService } from './roles.service.js';
import { CurrentUser, Roles, WebAuthGuard, webUserActor, type WebUser } from './web-auth.guard.js';

/** Поточний користувач панелі. */
@Controller('me')
@UseGuards(WebAuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: WebUser): Promise<MeView> {
    return this.auth.requireView(user.id);
  }
}

/** Облікові записи панелі та ролі; лише адміністратор (ТЗ 2: «управляет правами»). */
@Controller('admin/users')
@UseGuards(WebAuthGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  list(): Promise<WebUserView[]> {
    return this.auth.listUsers();
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateWebUserCommand)) body: CreateWebUserCommand,
    @CurrentUser() user: WebUser,
  ): Promise<WebUserView> {
    return this.auth.createUser(body, webUserActor(user));
  }

  @Post(':id/roles')
  @HttpCode(201)
  grant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GrantRoleCommand)) body: GrantRoleCommand,
    @CurrentUser() user: WebUser,
  ): Promise<RoleGrantView> {
    return this.roles.grant(id, body, webUserActor(user));
  }

  @Delete(':id/roles/:grantId')
  @HttpCode(204)
  async revoke(
    @Param('id') id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.roles.revoke(id, grantId, webUserActor(user));
  }
}
