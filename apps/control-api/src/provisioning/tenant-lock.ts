import { sql, type RegistryDbOrTx } from '@vakhta/registry';

/** Transaction-scoped lock: released on process loss, shared by runners and operator recovery. */
export async function lockTenant(tx: RegistryDbOrTx, tenantId: string): Promise<boolean> {
  const [row] = await tx.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`provision:${tenantId}`}, 0)) AS locked`,
  );
  return row?.locked === true;
}
