import { describe, expect, it, vi } from 'vitest';
import {
  EnvTenantSource,
  TenantSnapshot,
  tenantFromEnv,
  type TenantRuntimeConfig,
  type TenantSource,
} from '@vakhta/registry';
import { TENANT_SETTING_DEFAULTS } from '@vakhta/contracts';
import { TenantWorkerPool, type TenantWorker } from './pool.js';
import { resolveJobTenantId } from './resolve.js';

class FakeSource implements TenantSource {
  version = 1;
  private snapshot = new TenantSnapshot([]);
  set(tenants: TenantRuntimeConfig[]): void {
    this.snapshot = new TenantSnapshot(tenants);
    this.version += 1;
  }
  byHost(host: string) {
    return this.snapshot.byHost(host);
  }
  byId(id: string) {
    return this.snapshot.byId(id);
  }
  bySlug(slug: string) {
    return this.snapshot.bySlug(slug);
  }
  active() {
    return this.snapshot.active();
  }
  all() {
    return this.snapshot.tenants;
  }
  async refresh() {}
}

function tenant(id: string, over: Partial<TenantRuntimeConfig> = {}): TenantRuntimeConfig {
  return { ...tenantFromEnv({ DATABASE_URL: `postgres://db/${id}` }), id, slug: id, ...over };
}

function fakeWorker(
  t: TenantRuntimeConfig,
  stopped: string[],
  changed = () => false,
): TenantWorker {
  return {
    tenant: t,
    settings: TENANT_SETTING_DEFAULTS,
    settingsChanged: () => Promise.resolve(changed()),
    db: Object.create(null) as TenantWorker['db'],
    mediaDeps: null,
    tick: async () => {},
    stop: async () => {
      stopped.push(t.id);
    },
  };
}

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'a0000000-0000-4000-8000-000000000002';
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('TenantWorkerPool', () => {
  it('starts a worker per serving tenant, restarts on a changed secret and stops removed tenants', async () => {
    const source = new FakeSource();
    const stopped: string[] = [];
    const started: string[] = [];
    const pool = new TenantWorkerPool(
      source,
      async (t) => {
        started.push(t.id);
        return fakeWorker(t, stopped);
      },
      logger,
    );
    source.set([tenant(A), tenant(B, { status: 'SUSPENDED' })]);
    await pool.sync();
    expect(started).toEqual([A]);
    expect(pool.get(B)).toBeNull();

    source.set([tenant(A, { databaseUrl: 'postgres://db/a-rotated' }), tenant(B)]);
    await pool.sync();
    expect(stopped).toEqual([A]);
    expect(started).toEqual([A, A, B]);

    source.set([tenant(B)]);
    await pool.sync();
    expect(stopped).toEqual([A, A]);
    expect(pool.all().map((w) => w.tenant.id)).toEqual([B]);

    await pool.stopAll();
    expect(stopped).toEqual([A, A, B]);
  });

  it('keeps the other tenants running when one worker fails to start', async () => {
    const source = new FakeSource();
    const pool = new TenantWorkerPool(
      source,
      async (t) => {
        if (t.id === A) throw new Error('boom');
        return fakeWorker(t, []);
      },
      logger,
    );
    source.set([tenant(A), tenant(B)]);
    await pool.sync();
    expect(pool.get(A)).toBeNull();
    expect(pool.get(B)).not.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('TenantWorkerPool settings', () => {
  it('restarts a tenant worker when its stored settings change and leaves the others running', async () => {
    const source = new FakeSource();
    const stopped: string[] = [];
    const started: string[] = [];
    let alphaChanged = false;
    const pool = new TenantWorkerPool(
      source,
      async (t) => {
        started.push(t.id);
        return fakeWorker(t, stopped, () => t.id === A && alphaChanged);
      },
      logger,
    );
    source.set([tenant(A), tenant(B)]);
    await pool.sync();
    await pool.sync();
    expect(started).toEqual([A, B]);
    alphaChanged = true;
    await pool.sync();
    expect(stopped).toEqual([A]);
    expect(started).toEqual([A, B, A]);
  });
});

describe('resolveJobTenantId', () => {
  it('requires tenantId in registry mode and falls back to the env tenant in env mode', () => {
    const envTenant = new EnvTenantSource(tenantFromEnv({ DATABASE_URL: 'postgres://x' })).all()[0];
    expect(resolveJobTenantId({ tenantId: A }, 'registry')).toBe(A);
    expect(resolveJobTenantId({}, 'registry')).toBeNull();
    expect(resolveJobTenantId({ tenantId: 42 }, 'registry')).toBeNull();
    expect(resolveJobTenantId({}, 'env')).toBe(envTenant?.id);
    expect(resolveJobTenantId(null, 'env')).toBe(envTenant?.id);
  });
});
