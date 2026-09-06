import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateWebUserCommand,
  GrantRoleCommand,
  UpdateMeCommand,
  UpdateWebUserCommand,
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

  @Patch()
  update(
    @Body(new ZodValidationPipe(UpdateMeCommand)) body: UpdateMeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<MeView> {
    return this.auth.updateMe(user.id, body, webUserActor(user));
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWebUserCommand)) body: UpdateWebUserCommand,
    @CurrentUser() user: WebUser,
  ): Promise<WebUserView> {
    return this.auth.updateUser(id, body, webUserActor(user));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: WebUser): Promise<void> {
    await this.auth.deleteUser(id, webUserActor(user), user.id);
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
