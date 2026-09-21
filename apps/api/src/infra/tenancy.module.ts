import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenancyMode } from '@vakhta/domain';
import {
  EnvTenantSource,
  RegistryTenantSource,
  SecretCipher,
  createRegistry,
  tenantFromEnv,
  type TenantSource,
} from '@vakhta/registry';
import type { Env } from '../config/env.js';
import { createLogger } from '../logger.js';
import { RedisModule } from './redis.module.js';
import { TENANT_SOURCE, TenantRuntimeRegistry } from './tenant-runtime.js';

const REGISTRY_HANDLE = Symbol('REGISTRY_HANDLE');

interface RegistryHandle {
  readonly source: TenantSource;
  close(): Promise<void>;
}

async function openSource(config: ConfigService<Env, true>): Promise<RegistryHandle> {
  const mode = config.get('TENANCY_MODE', { infer: true });
  if (mode === TenancyMode.ENV) {
    const tenant = tenantFromEnv({
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      PUBLIC_BASE_URL: config.get('PUBLIC_BASE_URL', { infer: true }),
      CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
      TELEGRAM_BOT_TOKEN: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
      TELEGRAM_BOT_USERNAME: config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
      TELEGRAM_WEBHOOK_SECRET: config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
      DEFAULT_SITE_TIMEZONE: config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
      TELEGRAM_SUPPORT_BOT_TOKEN: config.get('TELEGRAM_SUPPORT_BOT_TOKEN', { infer: true }),
    });
    return { source: new EnvTenantSource(tenant), close: async () => {} };
  }
  const url = config.get('CONTROL_DATABASE_URL', { infer: true });
  const key = config.get('CONTROL_ENCRYPTION_KEY', { infer: true });
  if (!url || !key) {
    throw new Error(
      'TENANCY_MODE=registry requires CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY',
    );
  }
  const logger = createLogger({
    LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
  });
  const { db, client } = createRegistry(url, { max: 2 });
  const source = new RegistryTenantSource(db, new SecretCipher(key), {
    refreshEverySeconds: config.get('REGISTRY_REFRESH_SECONDS', { infer: true }),
    onError: (error) => logger.error({ err: error }, 'tenant registry refresh failed'),
  });
  // Refuse to start without a registry snapshot: serving a default tenant would be wrong.
  await source.reload();
  source.start();
  logger.info({ tenants: source.all().length }, 'tenant registry loaded');
  return {
    source,
    close: async () => {
      source.stop();
      await client.end({ timeout: 5 });
    },
  };
}

@Injectable()
class RegistryShutdown implements OnApplicationShutdown {
  constructor(@Inject(REGISTRY_HANDLE) private readonly handle: RegistryHandle) {}
  onApplicationShutdown(): Promise<void> {
    return this.handle.close();
  }
}

/** Global: the tenant source and per-tenant runtimes behind every DATABASE/AUTH/store proxy. */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    { provide: REGISTRY_HANDLE, useFactory: openSource, inject: [ConfigService] },
    {
      provide: TENANT_SOURCE,
      useFactory: (handle: RegistryHandle) => handle.source,
      inject: [REGISTRY_HANDLE],
    },
    TenantRuntimeRegistry,
    RegistryShutdown,
  ],
  exports: [TENANT_SOURCE, TenantRuntimeRegistry],
})
export class TenancyModule {}
