import { Inject, Injectable } from '@nestjs/common';
import { hashPassword } from 'better-auth/crypto';
import {
  and,
  eq,
  createDatabase,
  authUser,
  authAccount,
  authSession,
  onboardingConsumptions,
  webUserRoles,
  type Database,
} from '@vakhta/db';
import {
  tenants,
  tenantDomains,
  tenantModules,
  tenantSecrets,
  tenantInvitations,
  type RegistryDatabase,
  type RegistryDbOrTx,
  type SecretCipher,
} from '@vakhta/registry';
import {
  ModuleStatus,
  TenantDomainStatus,
  TenantModule,
  TenantSecretKind,
  TenantStatus,
  TenantSurface,
  normalizeHost,
} from '@vakhta/domain';
import { OnboardingStatus, type OnboardingView } from '@vakhta/contracts';
import { CONTROL_ENV, REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import type { ControlEnv } from '../config/env.js';
import { ControlError } from '../common/domain-error.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { ControlAudit } from '../audit/audit.service.js';

type Invitation = typeof tenantInvitations.$inferSelect;
interface Request {
  host: string;
  token: string;
  password?: string;
}
const CREDENTIAL_PROVIDER = 'credential';
const ADMIN_ROLE = 'ADMIN';
const ENTERPRISE_SCOPE = 'ENTERPRISE';

function unavailable(): never {
  throw new ControlError('INVITATION_UNAVAILABLE', 404, 'Invitation unavailable');
}

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    private readonly tenantService: TenantsService,
    private readonly audit: ControlAudit,
  ) {}

  async open(input: Request): Promise<OnboardingView> {
    const tokenHash = this.tenantService.hashInvitation(input.token);
    const [match] = await this.db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tokenHash, tokenHash))
      .limit(1);
    if (!match) return unavailable();
    return this.db.transaction(async (tx) => {
      // Reissue takes the same lock. Recheck all access decisions after obtaining it.
      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, match.tenantId))
        .for('update');
      const [invitation] = await tx
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, match.id));
      if (!tenant || !invitation || tenant.status !== TenantStatus.ACTIVE) return unavailable();
      await this.assertPanel(tx, tenant.id, input.host);
      const consumedAt = await this.withTenantDatabase(tx, invitation, input.password);
      if (consumedAt && !invitation.usedAt) {
        await tx
          .update(tenantInvitations)
          .set({ usedAt: consumedAt })
          .where(eq(tenantInvitations.id, invitation.id));
        await this.audit.record(tx, {
          actor: null,
          tenantId: tenant.id,
          action: 'tenant.invitation.consume',
          objectType: 'tenant_invitation',
          objectId: invitation.id,
        });
      }
      return this.view(tx, { invitation, displayName: tenant.name, consumed: consumedAt !== null });
    });
  }

  private async assertPanel(tx: RegistryDbOrTx, tenantId: string, host: string): Promise<void> {
    const [domain] = await tx
      .select({ id: tenantDomains.id })
      .from(tenantDomains)
      .where(
        and(
          eq(tenantDomains.tenantId, tenantId),
          eq(tenantDomains.host, normalizeHost(host)),
          eq(tenantDomains.surface, TenantSurface.PANEL),
          eq(tenantDomains.status, TenantDomainStatus.VERIFIED),
        ),
      );
    const [module] = await tx
      .select({ module: tenantModules.module })
      .from(tenantModules)
      .where(
        and(
          eq(tenantModules.tenantId, tenantId),
          eq(tenantModules.module, TenantModule.ADMIN_PANEL),
          eq(tenantModules.status, ModuleStatus.ENABLED),
        ),
      );
    if (!domain || !module) unavailable();
  }

  private async withTenantDatabase(
    tx: RegistryDbOrTx,
    invitation: Invitation,
    password: string | undefined,
  ): Promise<Date | null> {
    const [secret] = await tx
      .select()
      .from(tenantSecrets)
      .where(
        and(
          eq(tenantSecrets.tenantId, invitation.tenantId),
          eq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      );
    if (!secret) return unavailable();
    const handle = createDatabase(this.cipher.decrypt(secret), { max: 1 });
    try {
      return await this.consume(handle.db, invitation, password);
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  }

  private async consume(
    db: Database,
    invitation: Invitation,
    password: string | undefined,
  ): Promise<Date | null> {
    return db.transaction(async (tx) => {
      const [marker] = await tx
        .select()
        .from(onboardingConsumptions)
        .where(eq(onboardingConsumptions.invitationId, invitation.id));
      if (marker) return marker.consumedAt;
      if (invitation.usedAt) return invitation.usedAt;
      if (invitation.expiresAt.getTime() <= Date.now()) return unavailable();
      if (password === undefined) return null;
      const [user] = await tx
        .select({ id: authUser.id })
        .from(authUser)
        .innerJoin(webUserRoles, eq(webUserRoles.userId, authUser.id))
        .where(
          and(
            eq(authUser.email, invitation.adminEmail),
            eq(webUserRoles.role, ADMIN_ROLE),
            eq(webUserRoles.scopeType, ENTERPRISE_SCOPE),
          ),
        );
      if (!user) return unavailable();
      const [inserted] = await tx
        .insert(onboardingConsumptions)
        .values({ invitationId: invitation.id, userId: user.id })
        .onConflictDoNothing()
        .returning();
      if (!inserted) {
        const [existing] = await tx
          .select()
          .from(onboardingConsumptions)
          .where(eq(onboardingConsumptions.invitationId, invitation.id));
        if (!existing) throw new Error('Invitation consumption conflict');
        return existing.consumedAt;
      }
      const updated = await tx
        .update(authAccount)
        .set({ password: await hashPassword(password), updatedAt: new Date() })
        .where(
          and(eq(authAccount.userId, user.id), eq(authAccount.providerId, CREDENTIAL_PROVIDER)),
        )
        .returning({ id: authAccount.id });
      if (updated.length !== 1)
        throw new ControlError(
          'INVITATION_UNAVAILABLE',
          409,
          'Administrator credential is unavailable',
        );
      await tx.delete(authSession).where(eq(authSession.userId, user.id));
      return inserted.consumedAt;
    });
  }

  private async view(
    tx: RegistryDbOrTx,
    input: { invitation: Invitation; displayName: string; consumed: boolean },
  ): Promise<OnboardingView> {
    const { invitation, displayName, consumed } = input;
    const modules = await tx
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, invitation.tenantId));
    const bot = modules.find(
      (module) =>
        module.module === TenantModule.WORKER_BOT && module.status === ModuleStatus.ENABLED,
    );
    const username = bot?.config['botUsername'];
    const [kiosk] = await tx
      .select()
      .from(tenantDomains)
      .where(
        and(
          eq(tenantDomains.tenantId, invitation.tenantId),
          eq(tenantDomains.surface, TenantSurface.KIOSK),
          eq(tenantDomains.status, TenantDomainStatus.VERIFIED),
          eq(tenantDomains.isPrimary, true),
        ),
      );
    const hasKiosk = modules.some(
      (module) => module.module === TenantModule.QR_KIOSK && module.status === ModuleStatus.ENABLED,
    );
    return {
      status: consumed ? OnboardingStatus.USED : OnboardingStatus.READY,
      email: invitation.adminEmail,
      displayName,
      botUrl:
        typeof username === 'string' && /^[a-zA-Z0-9_]+$/.test(username)
          ? `https://t.me/${username}`
          : null,
      kioskUrl: hasKiosk && kiosk ? `${this.env.PLATFORM_SCHEME}://${kiosk.host}` : null,
    };
  }
}
