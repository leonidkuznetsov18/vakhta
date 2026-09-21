import { TenancyMode } from '@vakhta/domain';
import {
  EnvTenantSource,
  RegistryTenantSource,
  SecretCipher,
  createRegistry,
  tenantFromEnv,
  type TenantSource,
} from '@vakhta/registry';
import type { Logger } from 'pino';
import type { WorkerEnv } from '../env.js';

export interface WorkerTenantSource {
  readonly source: TenantSource;
  close(): Promise<void>;
}

/** Same rule as the API: env mode builds one tenant, registry mode refuses to start without a snapshot. */
export async function openTenantSource(
  env: WorkerEnv,
  logger: Pick<Logger, 'info' | 'error'>,
): Promise<WorkerTenantSource> {
  if (env.TENANCY_MODE === TenancyMode.ENV) {
    const tenant = tenantFromEnv({
      DATABASE_URL: env.DATABASE_URL,
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      CORS_ORIGINS: [env.COMMUNICATIONS_WEB_URL],
    });
    return { source: new EnvTenantSource(tenant), close: async () => {} };
  }
  if (!env.CONTROL_DATABASE_URL || !env.CONTROL_ENCRYPTION_KEY) {
    throw new Error(
      'TENANCY_MODE=registry requires CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY',
    );
  }
  const { db, client } = createRegistry(env.CONTROL_DATABASE_URL, { max: 2 });
  const source = new RegistryTenantSource(db, new SecretCipher(env.CONTROL_ENCRYPTION_KEY), {
    refreshEverySeconds: env.REGISTRY_REFRESH_SECONDS,
    onError: (error) => logger.error({ err: error }, 'tenant registry refresh failed'),
  });
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
