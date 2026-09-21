import { and, eq, like, sql } from 'drizzle-orm';
import { TENANT_SETTING_PREFIX, TENANT_SETTING_SCOPE, type SettingRow } from '@vakhta/contracts';
import type { DbOrTx, Transaction } from './client.js';
import { settings } from './schema/index.js';

/** The tenant's stored parameter overrides; resolution against defaults lives in @vakhta/contracts. */
export async function readTenantSettingRows(db: DbOrTx): Promise<SettingRow[]> {
  return db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      and(
        eq(settings.scope, TENANT_SETTING_SCOPE),
        like(settings.key, `${TENANT_SETTING_PREFIX}%`),
      ),
    );
}

/** Serializes writers of one tenant's parameters so cross-field rules see committed values. */
export async function lockTenantSettingsWithin(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${TENANT_SETTING_PREFIX}))`);
}

/** A loggable reason for a failed database call without the message, which may quote the URL. */
export function databaseErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : error.name;
}
