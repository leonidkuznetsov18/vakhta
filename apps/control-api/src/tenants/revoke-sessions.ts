import { authSession, createDatabase } from '@vakhta/db';
import { TenantSecretKind } from '@vakhta/domain';
import { and, eq, tenantSecrets, type RegistryDbOrTx, type SecretCipher } from '@vakhta/registry';
import { ControlError } from '../common/domain-error.js';

/** Retrying revocation is safe; never expose database credentials through driver errors. */
export async function revokeTenantSessions(
  tx: RegistryDbOrTx,
  cipher: SecretCipher,
  tenantId: string,
): Promise<void> {
  const [secret] = await tx
    .select()
    .from(tenantSecrets)
    .where(
      and(
        eq(tenantSecrets.tenantId, tenantId),
        eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
      ),
    );
  if (!secret) return;
  const handle = createDatabase(cipher.decrypt(secret), { max: 1 });
  try {
    await handle.db.delete(authSession);
  } catch {
    throw new ControlError(
      'SESSION_REVOCATION_FAILED',
      503,
      'Tenant sessions could not be revoked',
    );
  } finally {
    await handle.client.end({ timeout: 5 });
  }
}
