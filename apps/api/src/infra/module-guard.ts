import {
  applyDecorators,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantErrorCode } from '@vakhta/contracts';
import type { TenantModule } from '@vakhta/domain';
import { tenantHasModule } from '@vakhta/registry';
import { DomainError } from '../common/domain-error.js';
import { currentTenant } from './tenant-context.js';

const REQUIRED_MODULE = 'vakhta:required-module';

/** Answers 403 MODULE_DISABLED while the host-bound tenant has the module switched off. */
@Injectable()
export class TenantModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const module = this.reflector.getAllAndOverride<TenantModule | undefined>(REQUIRED_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!module || tenantHasModule(currentTenant().tenant, module)) return true;
    throw new DomainError(TenantErrorCode.MODULE_DISABLED, 403, `Module ${module} is disabled`);
  }
}

/** Routes of one tenant module (spec AC-017, AC-018); the switch applies within one refresh. */
export function RequiresModule(module: TenantModule): ClassDecorator & MethodDecorator {
  return applyDecorators(SetMetadata(REQUIRED_MODULE, module), UseGuards(TenantModuleGuard));
}
