import { randomBytes } from 'node:crypto';
import { createDatabase, migrateTenantDatabase, seedTenantDefaults, sql } from '@vakhta/db';
import { eq, tenants } from '@vakhta/registry';
import type { ProvisioningStep, StepContext } from './context.js';

interface DatabaseUrlParts {
  readonly database: string;
  readonly user?: string;
  readonly password?: string;
}

function withDatabase(adminUrl: string, parts: DatabaseUrlParts): string {
  const url = new URL(adminUrl);
  url.pathname = `/${parts.database}`;
  if (parts.user) url.username = parts.user;
  if (parts.password) url.password = parts.password;
  return url.toString();
}

async function databaseExists(ctx: StepContext, adminUrl: string): Promise<boolean> {
  const admin = createDatabase(adminUrl, { max: 1 });
  try {
    const rows = await admin.db.execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${ctx.tenant.databaseName}`,
    );
    return rows.length > 0;
  } finally {
    await admin.client.end({ timeout: 5 });
  }
}

/**
 * Creates `vakhta_t_<slug>` and an application role on the shared cluster, then stores the
 * tenant database URL encrypted. Without PROVISION_DATABASE_ADMIN_URL the operator creates the
 * database and sets the secret by hand.
 */
export const createDatabaseStep: ProvisioningStep = {
  async isDone(ctx) {
    return (await ctx.secret('DATABASE_URL')) !== null;
  },
  async run(ctx) {
    const adminUrl = ctx.env.PROVISION_DATABASE_ADMIN_URL;
    if (!adminUrl) {
      return {
        kind: 'manual',
        output: {
          instruction: 'CREATE_DATABASE_MANUALLY',
          database: ctx.tenant.databaseName,
          hint: 'Set PROVISION_DATABASE_ADMIN_URL on control-api or create the database and store its URL as the DATABASE_URL secret, then retry.',
        },
      };
    }
    const role = `${ctx.tenant.databaseName}_app`;
    const password = randomBytes(24).toString('base64url');
    const admin = createDatabase(adminUrl, { max: 1 });
    try {
      if (!(await databaseExists(ctx, adminUrl))) {
        await admin.db.execute(sql.raw(`CREATE DATABASE "${ctx.tenant.databaseName}"`));
      }
      const [existingRole] = await admin.db.execute(
        sql`SELECT 1 FROM pg_roles WHERE rolname = ${role}`,
      );
      if (existingRole)
        await admin.db.execute(sql.raw(`ALTER ROLE "${role}" WITH LOGIN PASSWORD '${password}'`));
      else
        await admin.db.execute(sql.raw(`CREATE ROLE "${role}" WITH LOGIN PASSWORD '${password}'`));
      await admin.db.execute(
        sql.raw(`GRANT ALL PRIVILEGES ON DATABASE "${ctx.tenant.databaseName}" TO "${role}"`),
      );
    } finally {
      await admin.client.end({ timeout: 5 });
    }
    // The role must own the schema objects it will migrate: grant on the public schema too.
    const owner = createDatabase(withDatabase(adminUrl, { database: ctx.tenant.databaseName }), {
      max: 1,
    });
    try {
      await owner.db.execute(sql.raw(`GRANT ALL ON SCHEMA public TO "${role}"`));
    } finally {
      await owner.client.end({ timeout: 5 });
    }
    await ctx.storeSecret(
      'DATABASE_URL',
      withDatabase(adminUrl, { database: ctx.tenant.databaseName, user: role, password }),
    );
    return { kind: 'done', output: { database: ctx.tenant.databaseName, role } };
  },
};

export const migrateStep: ProvisioningStep = {
  async isDone() {
    // Always re-run: the migrator is idempotent and records the current version.
    return false;
  },
  async run(ctx) {
    const url = await ctx.secret('DATABASE_URL');
    if (!url) throw new Error('DATABASE_URL secret is missing');
    const result = await migrateTenantDatabase(url);
    await ctx.db
      .update(tenants)
      .set({ schemaVersion: result.schemaVersion, migratedAt: new Date() })
      .where(eq(tenants.id, ctx.tenant.id));
    return { kind: 'done', output: { schemaVersion: result.schemaVersion, ms: result.ms } };
  },
};

export const seedDefaultsStep: ProvisioningStep = {
  async isDone() {
    return false;
  },
  async run(ctx) {
    const url = await ctx.secret('DATABASE_URL');
    if (!url) throw new Error('DATABASE_URL secret is missing');
    const handle = createDatabase(url, { max: 1 });
    try {
      const result = await seedTenantDefaults(handle.db, { timezone: ctx.tenant.timezone });
      return { kind: 'done', output: { ...result } };
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  },
};

export const storagePrefixStep: ProvisioningStep = {
  async isDone() {
    return false;
  },
  async run(ctx) {
    // Object storage needs no folder; the prefix is reserved by the unique column on tenants.
    return { kind: 'done', output: { prefix: ctx.tenant.storagePrefix } };
  },
};
