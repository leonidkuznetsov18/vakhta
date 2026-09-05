import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export interface DatabaseOptions {
  /** Розмір пулу на інстанс; 2+ stateless-інстанси × пул ≤ max_connections Postgres. */
  readonly max?: number;
}

export function createDatabase(url: string, options: DatabaseOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    // Усі моменти в UTC; локальний час рахується в застосунку за tz майданчика (ADR-5).
    connection: { timezone: 'UTC' },
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDatabase>['db'];
