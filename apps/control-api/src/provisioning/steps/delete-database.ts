import { createDatabase, sql } from '@vakhta/db';
import { z } from 'zod';
import { deletionDatabase } from '../../tenants/deletion-target.js';
import type { ProvisioningStep } from './context.js';

export const dropDatabaseStep: ProvisioningStep = {
  async isDone() {
    return false;
  },
  async run(ctx) {
    const database = z.string().min(1).parse(ctx.payload['database']);
    const current = await deletionDatabase(
      { tenant: ctx.tenant, db: ctx.db, cipher: ctx.cipher },
      ctx.env,
    );
    if (current !== database) throw new Error('Deletion database changed');
    const adminUrl = ctx.env.PROVISION_DATABASE_ADMIN_URL;
    if (!adminUrl) throw new Error('Database deletion is not configured');
    const maintenance = new URL(adminUrl);
    maintenance.pathname = '/postgres';
    const handle = createDatabase(maintenance.toString(), { max: 1 });
    try {
      const role = `vakhta_${ctx.tenant.id.replaceAll('-', '')}_app`;
      const [owner] = await handle.db.execute<{ owner: string; marker: string | null }>(sql`
        SELECT pg_get_userbyid(d.datdba) AS owner, shobj_description(d.datdba, 'pg_authid') AS marker
        FROM pg_database d WHERE d.datname = ${database}
      `);
      const registeredUrl = await ctx.secret('DATABASE_URL');
      const registeredUser = registeredUrl
        ? decodeURIComponent(new URL(registeredUrl).username)
        : null;
      if (
        owner &&
        (owner.owner !== registeredUser ||
          (registeredUser === role && owner.marker !== `vakhta-tenant:${ctx.tenant.id}`))
      )
        throw new Error('Database ownership does not match the registered tenant');
      await handle.db.execute(
        sql`DROP DATABASE IF EXISTS ${sql.identifier(database)} WITH (FORCE)`,
      );
      const [ownedRole] = await handle.db.execute<{ marker: string | null }>(sql`
        SELECT shobj_description(oid, 'pg_authid') AS marker FROM pg_roles WHERE rolname = ${role}
      `);
      if (ownedRole?.marker === `vakhta-tenant:${ctx.tenant.id}`)
        await handle.db.execute(sql`DROP ROLE ${sql.identifier(role)}`);
    } finally {
      await handle.client.end({ timeout: 5 });
    }
    return { kind: 'done' };
  },
};
