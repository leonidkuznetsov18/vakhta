import { Global, Module } from '@nestjs/common';
import { currentTenant, lateBound } from '../infra/tenant-context.js';
import { AdminUsersController, MeController } from './admin-users.controller.js';
import type { Auth, AuthConfig } from './auth.config.js';
import { AUTH, AUTH_CONFIG, AuthService } from './auth.service.js';
import { RolesService } from './roles.service.js';
import { WebAuthGuard } from './web-auth.guard.js';

/**
 * Global: WebAuthGuard and the services are needed by every admin controller. The better-auth
 * instance and its config belong to the tenant of the current request (one instance per tenant,
 * cached by TenantRuntimeRegistry), so sessions of one tenant never resolve in another.
 */
@Global()
@Module({
  controllers: [MeController, AdminUsersController],
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: (): AuthConfig => lateBound(() => currentTenant().authConfig),
    },
    { provide: AUTH, useFactory: (): Auth => lateBound(() => currentTenant().auth) },
    RolesService,
    AuthService,
    WebAuthGuard,
  ],
  exports: [AUTH, AuthService, RolesService, WebAuthGuard],
})
export class AuthModule {}
