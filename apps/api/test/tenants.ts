import type { TenantRuntimeConfig } from '@vakhta/registry';
import { ENV_TENANT_ID, EnvTenantSource, tenantFromEnv } from '@vakhta/registry';
import type { TenantRuntime } from '../src/infra/tenant-context.js';
import { runWithTenant } from '../src/infra/tenant-context.js';
import type { TenantRuntimeRegistry } from '../src/infra/tenant-runtime.js';

/**
 * A registry with exactly one tenant for unit tests that build services by hand. `forEachActive`
 * runs the callback once inside that tenant's context so `currentTenant()` resolves.
 */
export function singleTenantRegistry(
  overrides: Partial<TenantRuntime> = {},
): TenantRuntimeRegistry {
  const tenant: TenantRuntimeConfig = tenantFromEnv({ DATABASE_URL: 'postgres://test' });
  const runtime = Object.assign({ tenant, close: async () => {} }, overrides) as TenantRuntime;
  const source = new EnvTenantSource(tenant);
  const registry = {
    source,
    byHost: () => runtime,
    byId: (id: string) => (id === ENV_TENANT_ID ? runtime : null),
    bySlug: (slug: string) => (slug === tenant.slug ? runtime : null),
    runtimeFor: () => runtime,
    run: <T>(_id: string, fn: () => Promise<T>) => runWithTenant(runtime, fn),
    forEachActive: async (
      fn: (runtime: TenantRuntime) => Promise<void>,
      onError: (error: unknown, tenant: TenantRuntimeConfig) => void,
    ) => {
      try {
        await runWithTenant(runtime, () => fn(runtime));
      } catch (error) {
        onError(error, tenant);
      }
    },
    onApplicationShutdown: async () => {},
  };
  return registry as unknown as TenantRuntimeRegistry;
}
