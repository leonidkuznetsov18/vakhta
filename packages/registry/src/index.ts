export * from './schema/index.js';
export * from './client.js';
export * from './migrations.js';
export * from './secrets.js';
export * from './runtime-config.js';
export * from './source.js';
export * from './registry-source.js';
export * from './register.js';

/** Query operators re-exported so consumers share one drizzle-orm copy (same rule as @vakhta/db). */
export * from 'drizzle-orm';
