import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '@vakhta/db';
import type { Env } from '../config/env.js';
import { DATABASE } from '../infra/database.module.js';
import { AdminUsersController, MeController } from './admin-users.controller.js';
import { createAuth, type AuthConfig } from './auth.config.js';
import { AUTH, AUTH_CONFIG, AuthService } from './auth.service.js';
import { RolesService } from './roles.service.js';
import { WebAuthGuard } from './web-auth.guard.js';

/** Глобальний: WebAuthGuard і сервіси потрібні кожному адмін-контролеру. */
@Global()
@Module({
  controllers: [MeController, AdminUsersController],
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: (config: ConfigService<Env, true>, db: Database): AuthConfig => ({
        db,
        secret: config.get('AUTH_SECRET', { infer: true }),
        baseURL: config.get('PUBLIC_BASE_URL', { infer: true }),
        trustedOrigins: config.get('CORS_ORIGINS', { infer: true }),
      }),
      inject: [ConfigService, DATABASE],
    },
    { provide: AUTH, useFactory: (cfg: AuthConfig) => createAuth(cfg), inject: [AUTH_CONFIG] },
    RolesService,
    AuthService,
    WebAuthGuard,
  ],
  exports: [AUTH, AuthService, RolesService, WebAuthGuard],
})
export class AuthModule {}
