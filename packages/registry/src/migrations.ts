import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { RegistryDatabase } from './client.js';

/** Control-database migrations under a cluster-wide advisory lock: several deploys may race. */
export const REGISTRY_MIGRATION_LOCK = 7_011_001;

export function registryMigrationsFolder(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
}

export async function migrateRegistry(db: RegistryDatabase): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(${REGISTRY_MIGRATION_LOCK})`);
  try {
    await migrate(db, { migrationsFolder: registryMigrationsFolder() });
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${REGISTRY_MIGRATION_LOCK})`);
  }
}
