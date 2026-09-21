import { Inject, Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  and,
  asc,
  authAccount,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
  auditLog,
  createDatabase,
  eq,
  onboardingConsumptions,
  sql,
  webUserRoles,
  type Database,
  type Transaction,
} from '@vakhta/db';
import { TenantSecretKind } from '@vakhta/domain';
import {
  tenantInvitations,
  tenantSecrets,
  tenants,
  type RegistryDatabase,
  type RegistryDbOrTx,
  type SecretCipher,
} from '@vakhta/registry';
import {
  TENANT_ADMINISTRATORS_PAGE_SIZE,
  TenantAdministratorError,
  type SetTenantAdministratorPassword,
  type TenantAdministratorsView,
} from '@vakhta/contracts';
import { ControlAudit } from '../audit/audit.service.js';
import type { Operator } from '../auth/operator.guard.js';
import { ControlError } from '../common/domain-error.js';
import { REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { TenantsService } from '../tenants/tenants.service.js';

const Role = { ADMIN: 'ADMIN' } as const;
const Scope = { ENTERPRISE: 'ENTERPRISE' } as const;
const Provider = { CREDENTIAL: 'credential' } as const;
const Action = {
  PASSWORD: 'tenant.administrator.password',
  REMOVE: 'tenant.administrator.remove',
} as const;
const Actor = { SYSTEM: 'SYSTEM' } as const;
export interface AdministratorTarget {
  tenantId: string;
  userId: string;
  actor: Operator;
}

@Injectable()
export class AdministratorsService {
  constructor(
    @Inject(REGISTRY) private readonly registry: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    private readonly tenantService: TenantsService,
    private readonly audit: ControlAudit,
  ) {}

  async list(tenantId: string, page: number): Promise<TenantAdministratorsView> {
    await this.tenantService.require(tenantId);
    const url = await this.databaseUrl(this.registry, tenantId);
    if (!url) return { items: [], total: 0, databaseReady: false };
    return withDatabase(url, async (db) => {
      const users = await administrators(db);
      const enterpriseCount = users.filter((user) => user.enterprise).length;
      const start = (page - 1) * TENANT_ADMINISTRATORS_PAGE_SIZE;
      return {
        items: users.slice(start, start + TENANT_ADMINISTRATORS_PAGE_SIZE).map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt.toISOString(),
          canDelete: users.length > 1 && (!user.enterprise || enterpriseCount > 1),
        })),
        total: users.length,
        databaseReady: true,
      };
    });
  }

  async setPassword(
    target: AdministratorTarget,
    command: SetTenantAdministratorPassword,
  ): Promise<void> {
    const hashed = await hashPassword(command.password);
    await this.change(target, Action.PASSWORD, async (tx) => {
      const [credential] = await tx
        .select()
        .from(authAccount)
        .where(
          and(
            eq(authAccount.userId, target.userId),
            eq(authAccount.providerId, Provider.CREDENTIAL),
          ),
        );
      if (!credential?.password)
        throw new ControlError(
          TenantAdministratorError.CREDENTIAL_MISSING,
          409,
          'Password credential unavailable',
        );
      if (await verifyPassword({ hash: credential.password, password: command.password })) {
        throw new ControlError(
          TenantAdministratorError.UNCHANGED,
          409,
          'Choose a different password',
        );
      }
      await tx
        .update(authAccount)
        .set({ password: hashed, updatedAt: new Date() })
        .where(eq(authAccount.id, credential.id));
      await tx.delete(authSession).where(eq(authSession.userId, target.userId));
      await tx.delete(authVerification).where(eq(authVerification.value, target.userId));
    });
  }

  async remove(target: AdministratorTarget): Promise<void> {
    await this.change(target, Action.REMOVE, async (tx) => {
      const users = await administrators(tx);
      const user = users.find((candidate) => candidate.id === target.userId);
      const enterpriseCount = users.filter((candidate) => candidate.enterprise).length;
      if (users.length <= 1 || (user?.enterprise && enterpriseCount <= 1)) {
        throw new ControlError(
          TenantAdministratorError.LAST_ADMIN,
          409,
          'The last administrator cannot be removed',
        );
      }
      // Retain the identity and invitation evidence referenced by historical records.
      await tx.delete(webUserRoles).where(eq(webUserRoles.userId, target.userId));
      await tx.delete(authAccount).where(eq(authAccount.userId, target.userId));
      await tx.delete(authSession).where(eq(authSession.userId, target.userId));
      await tx.delete(authVerification).where(eq(authVerification.value, target.userId));
      await tx.delete(authTwoFactor).where(eq(authTwoFactor.userId, target.userId));
      await tx
        .update(authUser)
        .set({ twoFactorEnabled: false, updatedAt: new Date() })
        .where(eq(authUser.id, target.userId));
    });
  }

  private async change(
    target: AdministratorTarget,
    action: string,
    write: (tx: Transaction) => Promise<void>,
  ): Promise<void> {
    await this.registry.transaction(async (registryTx) => {
      const [tenant] = await registryTx
        .select()
        .from(tenants)
        .where(eq(tenants.id, target.tenantId))
        .for('update');
      if (!tenant) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
      const url = await this.databaseUrl(registryTx, target.tenantId);
      if (!url)
        throw new ControlError('TENANT_DATABASE_MISSING', 409, 'Tenant database unavailable');
      await withDatabase(url, (db) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`LOCK TABLE ${webUserRoles} IN SHARE ROW EXCLUSIVE MODE`);
          const users = await administrators(tx);
          const user = findAdministrator(users, target.userId);
          if (!user)
            throw new ControlError(
              TenantAdministratorError.NOT_FOUND,
              404,
              'Administrator not found',
            );
          await write(tx);
          await this.consumeInvitations({ registryTx, tx, target, email: user.email });
          await tx.insert(auditLog).values({
            actorType: Actor.SYSTEM,
            action,
            objectType: 'web_user',
            objectId: target.userId,
            after: { operatorId: target.actor.id, operatorEmail: target.actor.email },
          });
        }),
      );
      // Tenant audit commits with access changes; registry audit failure is surfaced to the caller.
      await this.audit.record(registryTx, {
        actor: target.actor,
        tenantId: target.tenantId,
        action,
        objectType: 'web_user',
        objectId: target.userId,
      });
    });
  }

  private async consumeInvitations(input: {
    registryTx: RegistryDbOrTx;
    tx: Transaction;
    target: AdministratorTarget;
    email: string;
  }): Promise<void> {
    const { registryTx, tx, target, email } = input;
    const invitations = await registryTx
      .select({ id: tenantInvitations.id })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.tenantId, target.tenantId),
          eq(tenantInvitations.adminEmail, email),
        ),
      );
    if (invitations.length === 0) return;
    await tx
      .insert(onboardingConsumptions)
      .values(
        invitations.map((invitation) => ({
          invitationId: invitation.id,
          userId: target.userId,
        })),
      )
      .onConflictDoNothing();
    await registryTx
      .update(tenantInvitations)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(tenantInvitations.tenantId, target.tenantId),
          eq(tenantInvitations.adminEmail, email),
          sql`${tenantInvitations.usedAt} IS NULL`,
        ),
      );
  }

  private async databaseUrl(db: RegistryDbOrTx, tenantId: string): Promise<string | null> {
    const [secret] = await db
      .select()
      .from(tenantSecrets)
      .where(
        and(
          eq(tenantSecrets.tenantId, tenantId),
          eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      );
    return secret ? this.cipher.decrypt(secret) : null;
  }
}

async function withDatabase<T>(url: string, run: (db: Database) => Promise<T>): Promise<T> {
  const handle = createDatabase(url, { max: 1 });
  try {
    return await run(handle.db);
  } finally {
    await handle.client.end({ timeout: 5 });
  }
}

async function administrators(db: Database | Transaction) {
  return db
    .select({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      twoFactorEnabled: authUser.twoFactorEnabled,
      createdAt: authUser.createdAt,
      enterprise: sql<boolean>`bool_or(${webUserRoles.scopeType} = ${Scope.ENTERPRISE})`,
    })
    .from(authUser)
    .innerJoin(webUserRoles, eq(webUserRoles.userId, authUser.id))
    .where(eq(webUserRoles.role, Role.ADMIN))
    .groupBy(authUser.id)
    .orderBy(asc(authUser.email));
}

function findAdministrator<T extends { id: string }>(users: T[], userId: string): T | undefined {
  return users.find((user) => user.id === userId);
}
