import { TenantSecretKind } from '@vakhta/domain';
import { eq, tenantSecrets, type RegistryDbOrTx, type SecretCipher } from '@vakhta/registry';
import { ControlError } from '../common/domain-error.js';
import type { ControlEnv } from '../config/env.js';
import type { TenantRow } from '../provisioning/steps/context.js';

/** Only the registered tenant database may be removed; never the control or maintenance database. */
export async function deletionDatabase(
  input: { tenant: TenantRow; db: RegistryDbOrTx; cipher: SecretCipher },
  env: ControlEnv,
): Promise<string> {
  if (!env.PROVISION_DATABASE_ADMIN_URL)
    throw new ControlError('DELETION_UNAVAILABLE', 503, 'Database deletion is not configured');
  const secrets = await input.db
    .select()
    .from(tenantSecrets)
    .where(eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL));
  const databases = secrets.map((secret) => {
    const url = new URL(input.cipher.decrypt(secret));
    return {
      tenantId: secret.tenantId,
      name: decodeURIComponent(url.pathname.slice(1)),
      server: `${url.hostname}:${url.port || '5432'}`,
    };
  });
  const registered = databases.find((database) => database.tenantId === input.tenant.id);
  const admin = new URL(env.PROVISION_DATABASE_ADMIN_URL);
  if (registered && registered.server !== `${admin.hostname}:${admin.port || '5432'}`)
    throw new ControlError('DELETION_UNSAFE', 409, 'Registered database is on a different server');
  const name =
    databases.find((database) => database.tenantId === input.tenant.id)?.name ??
    input.tenant.databaseName;
  const protectedNames = new Set([
    'postgres',
    'template0',
    'template1',
    decodeURIComponent(new URL(env.CONTROL_DATABASE_URL).pathname.slice(1)),
  ]);
  if (
    !name ||
    protectedNames.has(name) ||
    databases.some((database) => database.tenantId !== input.tenant.id && database.name === name)
  )
    throw new ControlError('DELETION_UNSAFE', 409, 'The database is shared or protected');
  return name;
}
