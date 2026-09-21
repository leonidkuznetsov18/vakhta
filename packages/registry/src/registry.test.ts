import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startTestRegistry, type TestRegistry } from '../test/db.js';
import { createRegistry } from './client.js';
import { registerExistingTenant } from './register.js';
import { RegistryTenantSource } from './registry-source.js';
import { controlAuditLog, tenantSecrets, tenants } from './schema/index.js';
import { SecretCipher, generateSecretKeyHex } from './secrets.js';

describe('control registry: register, load and refresh tenants', () => {
  let registry: TestRegistry;
  const cipher = new SecretCipher(generateSecretKeyHex());

  beforeAll(async () => {
    registry = await startTestRegistry();
  });
  afterAll(async () => {
    await registry.stop();
  });

  it('registers an existing tenant with encrypted secrets, verified hosts, modules and an audit row', async () => {
    const tenant = await registerExistingTenant(registry.db, cipher, {
      slug: 'zavoda',
      name: 'ЗаводА',
      timezone: 'Europe/Kyiv',
      defaultLocale: 'uk',
      databaseUrl: 'postgres://u:p@db/vakhta_t_zavoda',
      apiHost: 'API.zavoda.vakhta.xyz',
      panelHost: 'zavoda.vakhta.xyz',
      kioskHost: 'kiosk.zavoda.vakhta.xyz',
      botToken: '100:token-a',
      botUsername: 'zavoda_shift_bot',
      webhookSecret: 'webhook-secret-a',
      actorEmail: 'operator@vakhta.xyz',
    });
    const secrets = await registry.db
      .select()
      .from(tenantSecrets)
      .where(eq(tenantSecrets.tenantId, tenant.id));
    expect(secrets.map((s) => s.kind).sort()).toEqual([
      'BOT_TOKEN',
      'BOT_WEBHOOK_SECRET',
      'DATABASE_URL',
    ]);
    for (const secret of secrets)
      expect(secret.ciphertext.toString('utf8')).not.toContain('token-a');
    const audit = await registry.db.select().from(controlAuditLog);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.after)).not.toContain('token-a');
  });

  it('refuses a duplicate slug, a reserved slug and a bot token already used by another tenant', async () => {
    const base = {
      name: 'x',
      timezone: 'Europe/Kyiv',
      defaultLocale: 'ru' as const,
      databaseUrl: 'postgres://u:p@db/other',
      apiHost: 'api.other.vakhta.xyz',
    };
    await expect(
      registerExistingTenant(registry.db, cipher, { ...base, slug: 'zavoda' }),
    ).rejects.toThrow(/exists/);
    await expect(
      registerExistingTenant(registry.db, cipher, { ...base, slug: 'api' }),
    ).rejects.toThrow(/RESERVED/);
    await expect(
      registerExistingTenant(registry.db, cipher, {
        ...base,
        slug: 'other',
        botToken: '100:token-a',
      }),
    ).rejects.toThrow();
  });

  it('loads a snapshot with decrypted secrets and answers by host, id and slug', async () => {
    const source = new RegistryTenantSource(registry.db, cipher);
    await source.refresh();
    const tenant = source.bySlug('zavoda');
    expect(tenant).not.toBeNull();
    expect(tenant?.databaseUrl).toBe('postgres://u:p@db/vakhta_t_zavoda');
    expect(tenant?.botToken).toBe('100:token-a');
    expect(tenant?.botUsername).toBe('zavoda_shift_bot');
    expect(tenant?.redisPrefix).toBe(`t:${tenant?.id}:`);
    expect(tenant?.storagePrefix).toBe('tenants/zavoda/');
    expect(source.byHost('api.zavoda.vakhta.xyz:443')).toBe(tenant);
    expect(source.byHost('kiosk.zavoda.vakhta.xyz')).toBe(tenant);
    expect(source.byHost('unknown.vakhta.xyz')).toBeNull();
    expect(source.active().map((t) => t.slug)).toEqual(['zavoda']);
  });

  it('refresh is a no-op until updated_at moves, then reflects suspension', async () => {
    const source = new RegistryTenantSource(registry.db, cipher);
    await source.refresh();
    const versionBefore = source.version;
    await source.refresh();
    expect(source.version).toBe(versionBefore);
    await registry.db
      .update(tenants)
      .set({
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: 'test',
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.slug, 'zavoda'));
    await source.refresh();
    expect(source.version).toBe(versionBefore + 1);
    expect(source.active()).toEqual([]);
    expect(source.bySlug('zavoda')?.status).toBe('SUSPENDED');
  });

  it('the audit log rejects UPDATE and DELETE for the application role', async () => {
    await registry.db.execute(sql`CREATE ROLE control_app_test LOGIN`);
    await registry.db.execute(sql`GRANT SELECT, INSERT ON control_audit_log TO control_app_test`);
    await registry.db.execute(
      sql`GRANT USAGE ON SEQUENCE control_audit_log_id_seq TO control_app_test`,
    );
    // One physical connection, so SET ROLE applies to the statements under test.
    const { db: single, client } = createRegistry(registry.url, { max: 1 });
    try {
      await single.execute(sql`SET ROLE control_app_test`);
      // 42501 = insufficient_privilege; drizzle wraps the driver error as the cause.
      await expect(single.execute(sql`DELETE FROM control_audit_log`)).rejects.toSatisfy(
        isInsufficientPrivilege,
      );
      await expect(
        single.execute(sql`UPDATE control_audit_log SET action = 'x'`),
      ).rejects.toSatisfy(isInsufficientPrivilege);
      await expect(single.select().from(controlAuditLog)).resolves.toHaveLength(1);
    } finally {
      await client.end({ timeout: 5 });
    }
  });
});

function isInsufficientPrivilege(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause: unknown = error.cause;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '42501';
}
