import type { Database } from '@vakhta/db';
import type { TenantRuntimeConfig, TenantSource } from '@vakhta/registry';
import type { Logger } from 'pino';
import type { MediaDependencies } from '../media/process.js';

/** Everything the worker runs for one tenant; created by main.ts, owned by the pool. */
export interface TenantWorker {
  readonly tenant: TenantRuntimeConfig;
  readonly db: Database;
  readonly mediaDeps: MediaDependencies | null;
  /** One outbox relay and communication dispatch pass. */
  tick(): Promise<void>;
  stop(): Promise<void>;
}

interface PoolEntry {
  readonly fingerprint: string;
  readonly worker: TenantWorker;
}

/** What a restart must react to; stays in memory and is never logged (it holds secrets). */
function fingerprintOf(tenant: TenantRuntimeConfig): string {
  return JSON.stringify([
    tenant.status,
    tenant.databaseUrl,
    tenant.botToken,
    tenant.storagePrefix,
    tenant.domains.map((d) => `${d.surface}:${d.host}:${d.isPrimary}`),
  ]);
}

/**
 * Keeps one running TenantWorker per serving tenant (spec AC-014). `sync` starts workers for new
 * tenants, restarts those whose secrets or hosts changed and stops those no longer serving.
 */
export class TenantWorkerPool {
  private readonly entries = new Map<string, PoolEntry>();
  private syncing: Promise<void> | null = null;

  constructor(
    private readonly source: TenantSource,
    private readonly start: (tenant: TenantRuntimeConfig) => TenantWorker,
    private readonly logger: Pick<Logger, 'info' | 'error'>,
  ) {}

  sync(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.reconcile().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  get(tenantId: string): TenantWorker | null {
    return this.entries.get(tenantId)?.worker ?? null;
  }

  all(): TenantWorker[] {
    return [...this.entries.values()].map((entry) => entry.worker);
  }

  async stopAll(): Promise<void> {
    const workers = this.all();
    this.entries.clear();
    await Promise.all(workers.map((worker) => worker.stop()));
  }

  private async reconcile(): Promise<void> {
    const active = new Map(this.source.active().map((tenant) => [tenant.id, tenant]));
    const stale = [...this.entries.entries()].filter(([id, entry]) => {
      const tenant = active.get(id);
      return !tenant || fingerprintOf(tenant) !== entry.fingerprint;
    });
    await Promise.all(
      stale.map(async ([id, entry]) => {
        this.entries.delete(id);
        await entry.worker.stop();
        this.logger.info({ tenant: entry.worker.tenant.slug }, 'tenant worker stopped');
      }),
    );
    for (const tenant of active.values()) {
      if (this.entries.has(tenant.id)) continue;
      try {
        this.entries.set(tenant.id, {
          fingerprint: fingerprintOf(tenant),
          worker: this.start(tenant),
        });
        this.logger.info({ tenant: tenant.slug }, 'tenant worker started');
      } catch (error) {
        this.logger.error({ err: error, tenant: tenant.slug }, 'tenant worker failed to start');
      }
    }
  }
}
