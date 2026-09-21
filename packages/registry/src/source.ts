import { isServingTenantStatus } from '@vakhta/domain';
import type { TenantRuntimeConfig } from './runtime-config.js';

/**
 * Where a process learns its tenants. `version` increments on every observed change so callers
 * can evict cached per-tenant handles.
 */
export interface TenantSource {
  readonly version: number;
  byHost(host: string): TenantRuntimeConfig | null;
  byId(id: string): TenantRuntimeConfig | null;
  bySlug(slug: string): TenantRuntimeConfig | null;
  /** Tenants that serve traffic and background work. */
  active(): readonly TenantRuntimeConfig[];
  /** Every known non-archived tenant, including suspended ones. */
  all(): readonly TenantRuntimeConfig[];
  refresh(): Promise<void>;
}

/** One tenant for every request: local development, CI and the pilot before the registry cutover. */
export class EnvTenantSource implements TenantSource {
  readonly version = 1;
  constructor(private readonly tenant: TenantRuntimeConfig) {}

  byHost(_host: string): TenantRuntimeConfig | null {
    return this.tenant;
  }
  byId(id: string): TenantRuntimeConfig | null {
    return id === this.tenant.id ? this.tenant : null;
  }
  bySlug(slug: string): TenantRuntimeConfig | null {
    return slug === this.tenant.slug ? this.tenant : null;
  }
  active(): readonly TenantRuntimeConfig[] {
    return isServingTenantStatus(this.tenant.status) ? [this.tenant] : [];
  }
  all(): readonly TenantRuntimeConfig[] {
    return [this.tenant];
  }
  async refresh(): Promise<void> {}
}

/** Immutable lookup structure over one loaded snapshot. */
export class TenantSnapshot {
  private readonly byIdMap = new Map<string, TenantRuntimeConfig>();
  private readonly bySlugMap = new Map<string, TenantRuntimeConfig>();
  private readonly byHostMap = new Map<string, TenantRuntimeConfig>();

  constructor(readonly tenants: readonly TenantRuntimeConfig[]) {
    for (const tenant of tenants) {
      this.byIdMap.set(tenant.id, tenant);
      this.bySlugMap.set(tenant.slug, tenant);
      for (const domain of tenant.domains) this.byHostMap.set(domain.host, tenant);
    }
  }
  byId(id: string): TenantRuntimeConfig | null {
    return this.byIdMap.get(id) ?? null;
  }
  bySlug(slug: string): TenantRuntimeConfig | null {
    return this.bySlugMap.get(slug) ?? null;
  }
  byHost(host: string): TenantRuntimeConfig | null {
    return this.byHostMap.get(host) ?? null;
  }
  active(): readonly TenantRuntimeConfig[] {
    return this.tenants.filter((t) => isServingTenantStatus(t.status));
  }
}
