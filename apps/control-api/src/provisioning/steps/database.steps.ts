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

function tenantRole(ctx: StepContext): string {
  return `vakhta_${ctx.tenant.id.replaceAll('-', '')}_app`;
}

async function ensureRole(
  ctx: StepContext,
  admin: ReturnType<typeof createDatabase>,
): Promise<void> {
  const role = tenantRole(ctx);
  const marker = `vakhta-tenant:${ctx.tenant.id}`;
  const [existing] = await admin.db.execute<{ marker: string | null }>(
    sql`SELECT shobj_description(oid, 'pg_authid') AS marker FROM pg_roles WHERE rolname = ${role}`,
  );
  if (existing) {
    if (existing.marker !== marker) throw new Error('Database role is not owned by this tenant');
    return;
  }
  const saved = await ctx.secret('DATABASE_URL');
  const password = saved
    ? decodeURIComponent(new URL(saved).password)
    : randomBytes(24).toString('base64url');
  if (!saved) {
    const adminUrl = ctx.env.PROVISION_DATABASE_ADMIN_URL;
    if (!adminUrl) throw new Error('Database provisioning is not configured');
    await ctx.storeSecret(
      'DATABASE_URL',
      withDatabase(adminUrl, {
        database: ctx.tenant.databaseName,
        user: role,
        password,
      }),
    );
  }
  // Role creation and ownership evidence commit together; retries never reset an existing password.
  await admin.db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`CREATE ROLE "${role}" WITH LOGIN PASSWORD '${password.replaceAll("'", "''")}'`),
    );
    await tx.execute(sql.raw(`COMMENT ON ROLE "${role}" IS '${marker}'`));
  });
}

export const createDatabaseStep: ProvisioningStep = {
  async isDone(ctx) {
    const url = await ctx.secret('DATABASE_URL');
    if (!url) return false;
    const handle = createDatabase(url, { max: 1 });
    try {
      if (new URL(url).username !== tenantRole(ctx)) {
        await handle.db.execute(sql`SELECT 1`);
        return true;
      }
      const [database] = await handle.db.execute<{ owned: boolean }>(sql`
        SELECT d.datdba = r.oid AND shobj_description(r.oid, 'pg_authid') = ${`vakhta-tenant:${ctx.tenant.id}`} AS owned
        FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
        WHERE d.datname = current_database()
      `);
      return database?.owned === true;
    } catch {
      // Credentials are saved before CREATE ROLE/DATABASE so an interrupted step can resume.
      return false;
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  },
  async run(ctx) {
    const adminUrl = ctx.env.PROVISION_DATABASE_ADMIN_URL;
    if (!adminUrl)
      return {
        kind: 'manual',
        output: {
          instruction: 'CREATE_DATABASE_MANUALLY',
          database: ctx.tenant.databaseName,
          hint: 'Configure PROVISION_DATABASE_ADMIN_URL or register an existing database URL, then retry.',
        },
      };
    const role = tenantRole(ctx);
    const admin = createDatabase(adminUrl, { max: 1 });
    try {
      const [existing] = await admin.db.execute<{ owner: string }>(
        sql`SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = ${ctx.tenant.databaseName}`,
      );
      if (existing && existing.owner !== role)
        throw new Error('Database is not owned by this tenant');
      await ensureRole(ctx, admin);
      if (!existing) {
        await admin.db.execute(
          sql`CREATE DATABASE ${sql.identifier(ctx.tenant.databaseName)} OWNER ${sql.identifier(role)}`,
        );
      }
    } finally {
      await admin.client.end({ timeout: 5 });
    }
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
