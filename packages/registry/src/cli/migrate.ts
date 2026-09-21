/**
 * Applies control-registry migrations. Run: pnpm --filter @vakhta/registry migrate:js
 * Reads CONTROL_DATABASE_URL.
 */
import { createRegistry } from '../client.js';
import { migrateRegistry } from '../migrations.js';

const url = process.env['CONTROL_DATABASE_URL'];
if (!url) throw new Error('CONTROL_DATABASE_URL is not set');

const { db, client } = createRegistry(url, { max: 1 });
try {
  const startedAt = Date.now();
  await migrateRegistry(db);
  console.log(JSON.stringify({ ok: true, target: 'control', ms: Date.now() - startedAt }));
} finally {
  await client.end({ timeout: 5 });
}
