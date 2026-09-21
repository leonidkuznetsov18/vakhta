import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RegistryDatabase } from '@vakhta/registry';
import type { ControlEnv } from '../config/env.js';
import { REGISTRY } from '../infra/registry.module.js';
import { createControlAuth, type ControlAuth, type ControlAuthConfig } from './auth.config.js';

export const AUTH = Symbol('CONTROL_AUTH');
export const AUTH_CONFIG = Symbol('CONTROL_AUTH_CONFIG');
export type { ControlAuth };

@Global()
@Module({
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: (
        config: ConfigService<ControlEnv, true>,
        db: RegistryDatabase,
      ): ControlAuthConfig => ({
        db,
        secret: config.get('CONTROL_AUTH_SECRET', { infer: true }),
        baseURL: config.get('CONTROL_PUBLIC_BASE_URL', { infer: true }),
        trustedOrigins: config.get('CONTROL_CORS_ORIGINS', { infer: true }),
        cookieSameSite: config.get('AUTH_COOKIE_SAME_SITE', { infer: true }),
      }),
      inject: [ConfigService, REGISTRY],
    },
    {
      provide: AUTH,
      useFactory: (cfg: ControlAuthConfig) => createControlAuth(cfg),
      inject: [AUTH_CONFIG],
    },
  ],
  exports: [AUTH, AUTH_CONFIG],
})
export class ControlAuthModule {}
