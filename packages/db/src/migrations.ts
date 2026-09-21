import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';

/** Cluster-wide advisory lock: two deploys must not migrate the same tenant database at once. */
export const TENANT_MIGRATION_LOCK = 7_011_002;

export function migrationsFolder(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
}

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

/** The tag of the last migration in the journal: what "schema version" means for a tenant. */
export async function currentSchemaVersion(): Promise<string> {
  const raw = await readFile(path.join(migrationsFolder(), 'meta', '_journal.json'), 'utf8');
  const journal = JSON.parse(raw) as Journal;
  const last = journal.entries.at(-1);
  if (!last) throw new Error('migration journal is empty');
  return last.tag;
}

export interface TenantMigrationResult {
  readonly schemaVersion: string;
  readonly ms: number;
}

/** Applies the product migrations to one tenant database on a dedicated single connection. */
export async function migrateTenantDatabase(databaseUrl: string): Promise<TenantMigrationResult> {
  const startedAt = Date.now();
  const { db, client } = createDatabase(databaseUrl, { max: 1 });
  try {
    await db.execute(sql`SELECT pg_advisory_lock(${TENANT_MIGRATION_LOCK})`);
    try {
      await migrate(db, { migrationsFolder: migrationsFolder() });
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${TENANT_MIGRATION_LOCK})`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
  return { schemaVersion: await currentSchemaVersion(), ms: Date.now() - startedAt };
}
