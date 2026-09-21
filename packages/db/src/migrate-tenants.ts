/**
 * Deploy-time migrations (spec AC-021). Env mode: the single DATABASE_URL, like migrate.js.
 * Registry mode: the control database first, then every non-archived tenant in sequence; the
 * first failure stops the deploy and names the tenant. Run: node dist/migrate-tenants.js
 */
import { eq } from 'drizzle-orm';
import { TenancyMode, TenantStatus } from '@vakhta/domain';
import {
  RegistryTenantSource,
  SecretCipher,
  createRegistry,
  migrateRegistry,
  tenants,
  type TenantRuntimeConfig,
} from '@vakhta/registry';
import { migrateTenantDatabase } from './migrations.js';

const mode =
  process.env['TENANCY_MODE'] === TenancyMode.REGISTRY ? TenancyMode.REGISTRY : TenancyMode.ENV;

async function migrateEnvTenant(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL не задано');
  const result = await migrateTenantDatabase(url);
  console.log(JSON.stringify({ ok: true, target: 'env', ...result }));
}

async function migrateRegistryTenants(): Promise<void> {
  const controlUrl = process.env['CONTROL_DATABASE_URL'];
  const keyHex = process.env['CONTROL_ENCRYPTION_KEY'];
  if (!controlUrl || !keyHex) {
    throw new Error(
      'CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY are required in registry mode',
    );
  }
  const { db, client } = createRegistry(controlUrl, { max: 1 });
  try {
    const startedAt = Date.now();
    await migrateRegistry(db);
    console.log(JSON.stringify({ ok: true, target: 'control', ms: Date.now() - startedAt }));
    const source = new RegistryTenantSource(db, new SecretCipher(keyHex));
    await source.reload();
    const pending = source.all().filter((t) => t.status !== TenantStatus.ARCHIVED);
    await pending.reduce(
      (chain, tenant) => chain.then(() => migrateOne(tenant)),
      Promise.resolve(),
    );
  } finally {
    await client.end({ timeout: 5 });
  }

  async function migrateOne(tenant: TenantRuntimeConfig): Promise<void> {
    try {
      const result = await migrateTenantDatabase(tenant.databaseUrl);
      await db
        .update(tenants)
        .set({ schemaVersion: result.schemaVersion, migratedAt: new Date() })
        .where(eq(tenants.id, tenant.id));
      console.log(JSON.stringify({ ok: true, target: tenant.slug, ...result }));
    } catch (error) {
      console.error(JSON.stringify({ ok: false, target: tenant.slug }));
      throw error;
    }
  }
}

if (mode === TenancyMode.REGISTRY) await migrateRegistryTenants();
else await migrateEnvTenant();
