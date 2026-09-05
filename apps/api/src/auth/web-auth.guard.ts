import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { hasAnyRole, primaryRole, type RoleGrant, type WebRole } from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { toWebHeaders } from './auth.routes.js';
import { AuthService, type SessionUser } from './auth.service.js';
import { RolesService } from './roles.service.js';

export interface WebUser extends SessionUser {
  readonly grants: readonly RoleGrant[];
}

const ROLES_KEY = 'vakhta:roles';

/** Хто з ролей має доступ до обробника. Без декоратора достатньо будь-якої сесії. */
export const Roles = (...roles: WebRole[]) => SetMetadata(ROLES_KEY, roles);

type RequestWithUser = FastifyRequest & { webUser?: WebUser };

/**
 * Сесія better-auth + ролі з областями (FR-AUTH-03). Незавершений другий фактор
 * не дає сесії, тому сюди не потрапляє.
 */
@Injectable()
export class WebAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly roles: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.auth.sessionUser(toWebHeaders(request.headers));
    if (!user) throw new UnauthorizedException();

    const grants = await this.roles.grantsOf(user.id);
    request.webUser = { ...user, grants };

    const required = this.reflector.getAllAndOverride<WebRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !hasAnyRole(grants, required)) {
      throw new ForbiddenException('Недостатньо прав для цієї дії');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WebUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!request.webUser) throw new UnauthorizedException();
    return request.webUser;
  },
);

export function webUserActor(user: WebUser): Actor {
  return { type: 'WEB_USER', id: user.id, role: primaryRole(user.grants), label: user.email };
}
