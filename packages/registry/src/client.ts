import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export interface RegistryOptions {
  readonly max?: number;
}

/** Drizzle client for the control database. Small pools: every process reads it rarely. */
export function createRegistry(url: string, options: RegistryOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 2,
    connection: { timezone: 'UTC' },
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type RegistryDatabase = ReturnType<typeof createRegistry>['db'];
export type RegistryTransaction = Parameters<Parameters<RegistryDatabase['transaction']>[0]>[0];
export type RegistryDbOrTx = RegistryDatabase | RegistryTransaction;
