import { Global, Module } from '@nestjs/common';
import type { Database } from '@vakhta/db';
import { currentTenant, lateBound } from './tenant-context.js';

/**
 * Injection token of the Drizzle client: `@Inject(DATABASE) private readonly db: Database`.
 * The value follows the tenant bound to the current request or job (TenancyModule); using it
 * outside a tenant context throws TENANT_CONTEXT_MISSING instead of touching a default database.
 */
export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: (): Database => lateBound(() => currentTenant().db) },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
