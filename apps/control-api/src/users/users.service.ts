import { Inject, Injectable, Logger } from '@nestjs/common';
import { createDatabase, sql, type Transaction } from '@vakhta/db';
import { TenantSecretKind } from '@vakhta/domain';
import {
  and,
  eq,
  inArray,
  tenantSecrets,
  tenants,
  type RegistryDatabase,
  type SecretCipher,
} from '@vakhta/registry';
import {
  TenantUserAvailability,
  type TenantUserCountResult,
  type TenantUsersQuery,
} from '@vakhta/contracts';
import { z } from 'zod';
import { REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { ControlError } from '../common/domain-error.js';
import { LogoStorage } from '../branding/logo-storage.js';
import { readCounts, readDirectory } from './queries.js';

const READ_CONCURRENCY = 4;
const AvatarPurpose = { EMPLOYEE_AVATAR: 'EMPLOYEE_AVATAR' } as const;
type Target = {
  id: string;
  secret: typeof tenantSecrets.$inferSelect | null;
  storagePrefix: string;
};

@Injectable()
export class TenantUsersService {
  private readonly logger = new Logger(TenantUsersService.name);
  constructor(
    @Inject(REGISTRY) private readonly registry: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    private readonly storage: LogoStorage,
  ) {}

  async counts(ids: string[]): Promise<TenantUserCountResult[]> {
    const targets = await this.targets([...new Set(ids)]);
    return this.countBatch(targets);
  }

  private async countBatch(targets: Target[]): Promise<TenantUserCountResult[]> {
    if (targets.length === 0) return [];
    const results = await Promise.all(
      targets.slice(0, READ_CONCURRENCY).map((target) => this.count(target)),
    );
    return [...results, ...(await this.countBatch(targets.slice(READ_CONCURRENCY)))];
  }

  private async count(target: Target): Promise<TenantUserCountResult> {
    if (!target.secret) return { tenantId: target.id, status: TenantUserAvailability.NOT_READY };
    try {
      return {
        tenantId: target.id,
        status: TenantUserAvailability.READY,
        counts: await this.read(target, readCounts),
      };
    } catch {
      // Driver errors may contain tenant credentials; only log the safe target identifier.
      this.logger.warn({ tenantId: target.id }, 'Tenant user count unavailable');
      return { tenantId: target.id, status: TenantUserAvailability.UNAVAILABLE };
    }
  }

  async list(tenantId: string, query: TenantUsersQuery) {
    const target = await this.target(tenantId);
    return this.read(target, async (tx) => ({
      counts: await readCounts(tx),
      ...(await readDirectory(tx, query)),
    }));
  }

  async avatar(tenantId: string, employeeId: string) {
    const target = await this.target(tenantId);
    const key = await this.read(target, async (tx) => {
      const rows = await tx.execute(sql`SELECT m.storage_key AS key FROM employees e
        JOIN media_objects m ON m.id = e.avatar_media_id
        WHERE e.id = ${employeeId} AND m.purpose = ${AvatarPurpose.EMPLOYEE_AVATAR}`);
      return z.object({ key: z.string().nullable() }).optional().parse(rows[0])?.key;
    });
    const prefix = target.storagePrefix ? `${target.storagePrefix.replace(/\/$/, '')}/` : '';
    if (!key?.startsWith(`${prefix}employee-avatars/${employeeId}/`))
      throw new ControlError('AVATAR_NOT_FOUND', 404, 'Avatar not found');
    // Reuse the existing private object reader; this endpoint stays operator-authenticated.
    return this.storage.get(key);
  }

  private async target(id: string): Promise<Target> {
    const [target] = await this.targets([id]);
    if (!target) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
    return target;
  }

  private async targets(ids: string[]): Promise<Target[]> {
    return this.registry
      .select({ id: tenants.id, secret: tenantSecrets, storagePrefix: tenants.storagePrefix })
      .from(tenants)
      .leftJoin(
        tenantSecrets,
        and(
          eq(tenantSecrets.tenantId, tenants.id),
          eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      )
      .where(inArray(tenants.id, ids));
  }

  private async read<T>(target: Target, run: (tx: Transaction) => Promise<T>): Promise<T> {
    if (!target.secret)
      throw new ControlError('TENANT_DATABASE_MISSING', 409, 'Tenant database unavailable');
    const handle = createDatabase(this.cipher.decrypt(target.secret), {
      max: 1,
      connectTimeoutSeconds: 5,
    });
    try {
      return await handle.db.transaction(
        async (tx) => {
          await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
          return run(tx);
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    } catch (error) {
      if (error instanceof ControlError) throw error;
      this.logger.warn({ tenantId: target.id }, 'Tenant users unavailable');
      throw new ControlError('TENANT_USERS_UNAVAILABLE', 503, 'Tenant users unavailable');
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  }
}
