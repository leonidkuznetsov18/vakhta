import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { OperatorRole, OperatorStatus } from '@vakhta/domain';
import { toWebHeaders } from './auth.routes.js';
import { AUTH, type ControlAuth } from './auth.module.js';

export { OperatorRole };

export interface Operator {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: OperatorRole;
}

const ROLES_KEY = 'vakhta:operator-roles';
export const OperatorRoles = (...roles: OperatorRole[]) => SetMetadata(ROLES_KEY, roles);

type RequestWithOperator = FastifyRequest & { operator?: Operator };

interface SessionShape {
  readonly session: { readonly mfaVerified?: boolean };
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly twoFactorEnabled?: boolean | null;
    readonly role?: string | null;
    readonly status?: string | null;
  };
}

/**
 * Operator session with a verified, enabled second factor (spec data-model: TOTP is mandatory).
 * A disabled operator or one without TOTP cannot reach any control route.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: ControlAuth,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOperator>();
    const session = (await this.auth.api.getSession({
      headers: toWebHeaders(request.headers),
    })) as SessionShape | null;
    if (!session) throw new UnauthorizedException();
    const user = session.user;
    if (user.status !== OperatorStatus.ACTIVE) throw new ForbiddenException('Operator is disabled');
    if (user.twoFactorEnabled !== true || session.session.mfaVerified !== true) {
      throw new ForbiddenException('Two-factor authentication is required for operators');
    }
    const role =
      user.role === OperatorRole.PLATFORM_ADMIN
        ? OperatorRole.PLATFORM_ADMIN
        : OperatorRole.PLATFORM_VIEWER;
    request.operator = { id: user.id, email: user.email, name: user.name, role };
    const required = this.reflector.getAllAndOverride<OperatorRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(role)) {
      throw new ForbiddenException('Insufficient operator role');
    }
    return true;
  }
}

export const CurrentOperator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Operator => {
    const request = ctx.switchToHttp().getRequest<RequestWithOperator>();
    if (!request.operator) throw new UnauthorizedException();
    return request.operator;
  },
);
