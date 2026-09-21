import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ModuleStatus,
  ProvisioningKind,
  TENANT_SECRET_KINDS,
  TenantModule,
  TenantSecretKind,
  TenantStatus,
  TenantSurface,
  canTransitionTenant,
  normalizeHost,
  tenantDatabaseName,
  tenantSlugProblem,
  tenantStoragePrefix,
  type TenantModule as ModuleCode,
  type TenantSecretKind as SecretKind,
  type TenantSurface as Surface,
} from '@vakhta/domain';
import {
  and,
  desc,
  eq,
  provisioningJobs,
  sql,
  tenantBranding,
  tenantDomains,
  tenantInvitations,
  tenantModules,
  tenantSecrets,
  tenants,
  type RegistryDatabase,
  type RegistryDbOrTx,
  type SecretCipher,
} from '@vakhta/registry';
import type {
  AddDomainCommand,
  CreateTenantCommand,
  SetBotTokenCommand,
  SetModuleCommand,
  TenantDetailView,
  TenantSummaryView,
  UpdateTenantCommand,
} from '@vakhta/contracts';
import { ControlAudit } from '../audit/audit.service.js';
import type { Operator } from '../auth/operator.guard.js';
import { ControlError } from '../common/domain-error.js';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { TelegramProvider } from '../provisioning/telegram.provider.js';
import { managedHosts, type ManagedHost } from './hosts.js';

type TenantRow = typeof tenants.$inferSelect;
type DomainRow = typeof tenantDomains.$inferSelect;
type SecretRow = typeof tenantSecrets.$inferSelect;
type ModuleRow = typeof tenantModules.$inferSelect;

const INVITATION_ONBOARDING = 'ONBOARDING';

export interface SetModuleInput extends SetModuleCommand {
  readonly module: ModuleCode;
}

export interface IssueInvitationInput {
  readonly tenantId: string;
  readonly adminEmail: string;
  readonly actor: Operator | null;
  readonly tx?: RegistryDbOrTx;
}

interface TransitionInput {
  readonly tenantId: string;
  readonly to: 'SUSPENDED' | 'ACTIVE';
  readonly actor: Operator;
  readonly reason: string | null;
}

interface StoreSecretInput {
  readonly tenantId: string;
  readonly kind: SecretKind;
  readonly value: string;
  readonly actorId: string | null;
}

interface TenantParts {
  readonly brand: typeof tenantBranding.$inferSelect | undefined;
  readonly modules: ModuleRow[];
  readonly domains: DomainRow[];
  readonly secrets: SecretRow[];
  readonly invitation: typeof tenantInvitations.$inferSelect | undefined;
}

/** Tenant registry writes: every change is one transaction with an audit row and a bumped updated_at. */
@Injectable()
export class TenantsService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    private readonly audit: ControlAudit,
    private readonly provisioning: ProvisioningService,
    private readonly telegram: TelegramProvider,
  ) {}

  async list(): Promise<TenantSummaryView[]> {
    const rows = await this.db.select().from(tenants).orderBy(desc(tenants.createdAt));
    return Promise.all(rows.map((row) => this.summary(row)));
  }

  async get(tenantId: string): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    const [summary, parts] = await Promise.all([this.summary(row), this.partsOf(row.id)]);
    return this.detail(row, summary, parts);
  }

  async create(cmd: CreateTenantCommand, actor: Operator): Promise<TenantDetailView> {
    const problem = tenantSlugProblem(cmd.slug);
    if (problem) throw new ControlError('TENANT_SLUG_INVALID', 422, `Slug problem: ${problem}`);
    const [taken] = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, cmd.slug));
    if (taken) throw new ControlError('TENANT_SLUG_TAKEN', 409, `Slug ${cmd.slug} is taken`);
    const bot = cmd.botToken ? await this.verifyBotToken(cmd.botToken) : null;
    const hosts = managedHosts(this.env, cmd.slug);

    const tenantId = await this.db.transaction(async (tx) => {
      const id = await this.insertTenantRows(tx, {
        cmd,
        hosts,
        botUsername: bot?.username ?? null,
        actor,
      });
      if (cmd.provision) await this.queueProvisioning(tx, { tenantId: id, cmd, actor });
      return id;
    });
    return this.get(tenantId);
  }

  async update(
    tenantId: string,
    cmd: UpdateTenantCommand,
    actor: Operator,
  ): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    await this.db.transaction(async (tx) => {
      const set: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
      if (cmd.name !== undefined) set.name = cmd.name;
      if (cmd.defaultLocale !== undefined) set.defaultLocale = cmd.defaultLocale;
      if (cmd.timezone !== undefined) set.timezone = cmd.timezone;
      await tx.update(tenants).set(set).where(eq(tenants.id, row.id));
      const brandSet: Partial<typeof tenantBranding.$inferInsert> = { updatedAt: new Date() };
      if (cmd.displayName !== undefined) brandSet.displayName = cmd.displayName;
      if (cmd.accentColor !== undefined) brandSet.accentColor = cmd.accentColor;
      await tx.update(tenantBranding).set(brandSet).where(eq(tenantBranding.tenantId, row.id));
      await this.audit.record(tx, {
        actor,
        action: 'tenant.update',
        tenantId: row.id,
        objectType: 'tenant',
        objectId: row.id,
        before: { name: row.name, defaultLocale: row.defaultLocale, timezone: row.timezone },
        after: { ...cmd },
      });
    });
    return this.get(tenantId);
  }

  async setModule(
    tenantId: string,
    cmd: SetModuleInput,
    actor: Operator,
  ): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    const status = cmd.enabled ? ModuleStatus.ENABLED : ModuleStatus.DISABLED;
    const stamps = {
      enabledAt: cmd.enabled ? new Date() : null,
      disabledAt: cmd.enabled ? null : new Date(),
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(tenantModules)
        .values({
          tenantId: row.id,
          module: cmd.module,
          status,
          config: cmd.config ?? {},
          ...stamps,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.module],
          set: { status, ...(cmd.config ? { config: cmd.config } : {}), ...stamps },
        });
      await this.touch(tx, row.id);
      await this.audit.record(tx, {
        actor,
        action: cmd.enabled ? 'tenant.module.enable' : 'tenant.module.disable',
        tenantId: row.id,
        objectType: 'tenant_module',
        objectId: cmd.module,
        after: { enabled: cmd.enabled, config: cmd.config ?? null },
      });
      if (cmd.module === TenantModule.WORKER_BOT && row.status === TenantStatus.ACTIVE) {
        await this.provisioning.createJob(tx, {
          tenantId: row.id,
          kind: cmd.enabled ? ProvisioningKind.ENABLE_MODULE : ProvisioningKind.DISABLE_MODULE,
          requestedBy: actor.id,
          modules: [cmd.module],
          payload: {},
        });
      }
    });
    return this.get(tenantId);
  }

  async addDomain(
    tenantId: string,
    cmd: AddDomainCommand,
    actor: Operator,
  ): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    const host = normalizeHost(cmd.host);
    await this.db.transaction(async (tx) => {
      if (cmd.isPrimary) {
        await tx
          .update(tenantDomains)
          .set({ isPrimary: false })
          .where(and(eq(tenantDomains.tenantId, row.id), eq(tenantDomains.surface, cmd.surface)));
      }
      await tx.insert(tenantDomains).values({
        tenantId: row.id,
        host,
        surface: cmd.surface,
        isPrimary: cmd.isPrimary,
        isManaged: false,
      });
      await this.touch(tx, row.id);
      await this.audit.record(tx, {
        actor,
        action: 'tenant.domain.add',
        tenantId: row.id,
        objectType: 'tenant_domain',
        objectId: host,
        after: { surface: cmd.surface, isPrimary: cmd.isPrimary },
      });
    });
    return this.get(tenantId);
  }

  async setBotToken(
    tenantId: string,
    cmd: SetBotTokenCommand,
    actor: Operator,
  ): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    const bot = await this.verifyBotToken(cmd.botToken);
    await this.db.transaction(async (tx) => {
      await this.storeSecret(tx, {
        tenantId: row.id,
        kind: TenantSecretKind.BOT_TOKEN,
        value: cmd.botToken,
        actorId: actor.id,
      });
      const config = { botUsername: bot.username };
      await tx
        .insert(tenantModules)
        .values({
          tenantId: row.id,
          module: TenantModule.WORKER_BOT,
          config,
          enabledAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.module],
          set: { config },
        });
      await this.touch(tx, row.id);
      await this.audit.record(tx, {
        actor,
        action: 'tenant.secret.set',
        tenantId: row.id,
        objectType: 'tenant_secret',
        objectId: TenantSecretKind.BOT_TOKEN,
        after: { botUsername: bot.username },
      });
      if (row.status === TenantStatus.ACTIVE) {
        await this.provisioning.createJob(tx, {
          tenantId: row.id,
          kind: ProvisioningKind.ROTATE_BOT_TOKEN,
          requestedBy: actor.id,
          modules: [TenantModule.WORKER_BOT],
          payload: {},
        });
      }
    });
    return this.get(tenantId);
  }

  suspend(tenantId: string, reason: string, actor: Operator): Promise<TenantDetailView> {
    return this.transition({ tenantId, to: TenantStatus.SUSPENDED, actor, reason });
  }

  resume(tenantId: string, actor: Operator): Promise<TenantDetailView> {
    return this.transition({ tenantId, to: TenantStatus.ACTIVE, actor, reason: null });
  }

  async startProvisioning(tenantId: string, actor: Operator): Promise<TenantDetailView> {
    const row = await this.require(tenantId);
    const modules = await this.db
      .select({ module: tenantModules.module })
      .from(tenantModules)
      .where(
        and(eq(tenantModules.tenantId, row.id), eq(tenantModules.status, ModuleStatus.ENABLED)),
      );
    await this.db.transaction(async (tx) => {
      await this.provisioning.createJob(tx, {
        tenantId: row.id,
        kind: ProvisioningKind.PROVISION,
        requestedBy: actor.id,
        modules: modules.map((m) => m.module),
        payload: {},
      });
      if (row.status === TenantStatus.DRAFT) {
        await tx
          .update(tenants)
          .set({ status: TenantStatus.PROVISIONING, updatedAt: sql`now()` })
          .where(eq(tenants.id, row.id));
      }
      await this.audit.record(tx, {
        actor,
        action: 'tenant.provision',
        tenantId: row.id,
        objectType: 'tenant',
        objectId: row.id,
      });
    });
    return this.get(tenantId);
  }

  /** A fresh onboarding link; the previous unused one expires. Returns the token once. */
  async issueInvitation(input: IssueInvitationInput): Promise<{ url: string; token: string }> {
    const tx = input.tx ?? this.db;
    const row = await this.require(input.tenantId);
    const token = randomBytes(24).toString('base64url');
    await tx
      .update(tenantInvitations)
      .set({ expiresAt: new Date() })
      .where(and(eq(tenantInvitations.tenantId, row.id), sql`${tenantInvitations.usedAt} IS NULL`));
    const [created] = await tx
      .insert(tenantInvitations)
      .values({
        tenantId: row.id,
        kind: INVITATION_ONBOARDING,
        tokenHash: this.hashInvitation(token),
        adminEmail: input.adminEmail,
        expiresAt: new Date(Date.now() + this.env.INVITATION_TTL_HOURS * 3_600_000),
        issuedBy: input.actor?.id ?? null,
      })
      .returning({ id: tenantInvitations.id });
    if (!created) throw new Error('tenant_invitations: insert returned no row');
    await this.audit.record(tx, {
      actor: input.actor,
      action: 'tenant.invitation.issue',
      tenantId: row.id,
      objectType: 'tenant_invitation',
      objectId: created.id,
      after: { adminEmail: input.adminEmail },
    });
    const panelHost = await this.primaryHost(row.id, TenantSurface.PANEL);
    return { url: this.onboardingUrl(panelHost, token), token };
  }

  hashInvitation(token: string): string {
    return createHmac('sha256', this.env.CONTROL_AUTH_SECRET).update(token).digest('hex');
  }

  async require(tenantId: string): Promise<TenantRow> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!row) throw new ControlError('TENANT_NOT_FOUND', 404, `Tenant ${tenantId} not found`);
    return row;
  }

  private onboardingUrl(panelHost: string | null, token: string): string {
    return `${this.env.PLATFORM_SCHEME}://${panelHost ?? 'panel.invalid'}/#/welcome/${token}`;
  }

  private async touch(tx: RegistryDbOrTx, tenantId: string): Promise<void> {
    await tx
      .update(tenants)
      .set({ updatedAt: sql`now()` })
      .where(eq(tenants.id, tenantId));
  }

  private async queueProvisioning(
    tx: RegistryDbOrTx,
    input: { tenantId: string; cmd: CreateTenantCommand; actor: Operator },
  ): Promise<void> {
    const { tenantId, cmd, actor } = input;
    await this.provisioning.createJob(tx, {
      tenantId,
      kind: ProvisioningKind.PROVISION,
      requestedBy: actor.id,
      modules: cmd.modules,
      payload: { adminEmail: cmd.adminEmail, adminName: cmd.adminName },
    });
    await tx
      .update(tenants)
      .set({ status: TenantStatus.PROVISIONING, updatedAt: sql`now()` })
      .where(eq(tenants.id, tenantId));
  }

  private async insertTenantRows(
    tx: RegistryDbOrTx,
    input: {
      cmd: CreateTenantCommand;
      hosts: readonly ManagedHost[];
      botUsername: string | null;
      actor: Operator;
    },
  ): Promise<string> {
    const { cmd, hosts, botUsername, actor } = input;
    const [row] = await tx
      .insert(tenants)
      .values({
        slug: cmd.slug,
        name: cmd.name,
        status: TenantStatus.DRAFT,
        defaultLocale: cmd.defaultLocale,
        timezone: cmd.timezone,
        storagePrefix: tenantStoragePrefix(cmd.slug),
        databaseName: tenantDatabaseName(cmd.slug),
        createdBy: actor.id,
      })
      .returning({ id: tenants.id });
    if (!row) throw new Error('tenants: insert returned no row');
    await tx
      .insert(tenantBranding)
      .values({ tenantId: row.id, displayName: cmd.displayName ?? cmd.name });
    await tx.insert(tenantModules).values(
      cmd.modules.map((module) => ({
        tenantId: row.id,
        module,
        enabledAt: new Date(),
        config: module === TenantModule.WORKER_BOT && botUsername ? { botUsername } : {},
      })),
    );
    await tx.insert(tenantDomains).values(
      hosts.map((h) => ({
        tenantId: row.id,
        host: h.host,
        surface: h.surface,
        isPrimary: true,
        isManaged: true,
      })),
    );
    if (cmd.botToken) {
      await this.storeSecret(tx, {
        tenantId: row.id,
        kind: TenantSecretKind.BOT_TOKEN,
        value: cmd.botToken,
        actorId: actor.id,
      });
    }
    await this.audit.record(tx, {
      actor,
      action: 'tenant.create',
      tenantId: row.id,
      objectType: 'tenant',
      objectId: row.id,
      after: {
        slug: cmd.slug,
        name: cmd.name,
        modules: cmd.modules,
        hosts: hosts.map((h) => h.host),
        bot: botUsername,
      },
    });
    return row.id;
  }

  private async transition(input: TransitionInput): Promise<TenantDetailView> {
    const { tenantId, to, actor, reason } = input;
    const row = await this.require(tenantId);
    if (!canTransitionTenant(row.status, to)) {
      throw new ControlError(
        'TENANT_TRANSITION_INVALID',
        409,
        `Cannot go from ${row.status} to ${to}`,
      );
    }
    const suspending = to === TenantStatus.SUSPENDED;
    await this.db.transaction(async (tx) => {
      await tx
        .update(tenants)
        .set({
          status: to,
          suspendedAt: suspending ? new Date() : null,
          suspendedReason: suspending ? reason : null,
          updatedAt: sql`now()`,
        })
        .where(eq(tenants.id, row.id));
      await this.audit.record(tx, {
        actor,
        action: suspending ? 'tenant.suspend' : 'tenant.resume',
        tenantId: row.id,
        objectType: 'tenant',
        objectId: row.id,
        before: { status: row.status },
        after: { status: to, reason },
      });
    });
    return this.get(tenantId);
  }

  private async verifyBotToken(token: string): Promise<{ username: string }> {
    const identity = await this.telegram.verifyToken(token);
    const [duplicate] = await this.db
      .select({ tenantId: tenantSecrets.tenantId })
      .from(tenantSecrets)
      .where(
        and(
          eq(tenantSecrets.kind, TenantSecretKind.BOT_TOKEN),
          eq(tenantSecrets.fingerprint, this.cipher.fingerprint(token)),
        ),
      );
    if (duplicate)
      throw new ControlError('BOT_TOKEN_IN_USE', 409, 'This bot token belongs to another tenant');
    return identity;
  }

  private async storeSecret(tx: RegistryDbOrTx, secret: StoreSecretInput): Promise<void> {
    const encrypted = this.cipher.encrypt(secret.value);
    const values = {
      tenantId: secret.tenantId,
      kind: secret.kind,
      ciphertext: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
      fingerprint: this.cipher.fingerprint(secret.value),
      updatedBy: secret.actorId,
      updatedAt: new Date(),
    };
    await tx
      .insert(tenantSecrets)
      .values(values)
      .onConflictDoUpdate({ target: [tenantSecrets.tenantId, tenantSecrets.kind], set: values });
  }

  private async partsOf(tenantId: string): Promise<TenantParts> {
    const [[brand], modules, domains, secrets, [invitation]] = await Promise.all([
      this.db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, tenantId)),
      this.db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId)),
      this.db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
      this.db.select().from(tenantSecrets).where(eq(tenantSecrets.tenantId, tenantId)),
      this.db
        .select()
        .from(tenantInvitations)
        .where(
          and(
            eq(tenantInvitations.tenantId, tenantId),
            eq(tenantInvitations.kind, INVITATION_ONBOARDING),
          ),
        )
        .orderBy(desc(tenantInvitations.createdAt))
        .limit(1),
    ]);
    return { brand, modules, domains, secrets, invitation };
  }

  private detail(row: TenantRow, summary: TenantSummaryView, parts: TenantParts): TenantDetailView {
    return {
      ...summary,
      ...tenantFacts(row),
      ...brandingFacts(parts),
      moduleRows: parts.modules.map((m) => ({
        module: m.module,
        enabled: m.status === ModuleStatus.ENABLED,
        config: m.config,
      })),
      domains: parts.domains.map(domainView),
      secrets: secretViews(parts.secrets),
      onboarding: parts.invitation
        ? {
            url: this.onboardingUrl(summary.panelHost, parts.invitation.id),
            expiresAt: parts.invitation.expiresAt.toISOString(),
            usedAt: parts.invitation.usedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private async summary(row: TenantRow): Promise<TenantSummaryView> {
    const [[brand], modules, [job], panelHost] = await Promise.all([
      this.db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, row.id)),
      this.db
        .select({ module: tenantModules.module })
        .from(tenantModules)
        .where(
          and(eq(tenantModules.tenantId, row.id), eq(tenantModules.status, ModuleStatus.ENABLED)),
        ),
      this.db
        .select()
        .from(provisioningJobs)
        .where(eq(provisioningJobs.tenantId, row.id))
        .orderBy(desc(provisioningJobs.createdAt))
        .limit(1),
      this.primaryHost(row.id, TenantSurface.PANEL),
    ]);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      displayName: brand?.displayName ?? row.name,
      status: row.status,
      modules: modules.map((m) => m.module),
      schemaVersion: row.schemaVersion,
      panelHost,
      lastJob: job
        ? {
            id: job.id,
            kind: job.kind,
            status: job.status,
            at: (job.finishedAt ?? job.startedAt ?? job.createdAt).toISOString(),
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async primaryHost(tenantId: string, surface: Surface): Promise<string | null> {
    const [primary] = await this.db
      .select({ host: tenantDomains.host })
      .from(tenantDomains)
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.surface, surface)))
      .orderBy(desc(tenantDomains.isPrimary))
      .limit(1);
    return primary?.host ?? null;
  }
}

function domainView(d: DomainRow): TenantDetailView['domains'][number] {
  return {
    id: d.id,
    host: d.host,
    surface: d.surface,
    isPrimary: d.isPrimary,
    isManaged: d.isManaged,
    status: d.status,
    verifiedAt: d.verifiedAt?.toISOString() ?? null,
  };
}

function secretViews(rows: readonly SecretRow[]): TenantDetailView['secrets'] {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return TENANT_SECRET_KINDS.map((kind) => {
    const secret = byKind.get(kind);
    return { kind, present: Boolean(secret), updatedAt: secret?.updatedAt.toISOString() ?? null };
  });
}

function tenantFacts(row: TenantRow) {
  return {
    defaultLocale: row.defaultLocale,
    timezone: row.timezone,
    storagePrefix: row.storagePrefix,
    databaseName: row.databaseName,
    migratedAt: row.migratedAt?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedReason: row.suspendedReason,
  };
}

function brandingFacts(parts: TenantParts) {
  const botUsername = parts.modules.find((m) => m.module === TenantModule.WORKER_BOT)?.config[
    'botUsername'
  ];
  return {
    accentColor: parts.brand?.accentColor ?? null,
    logoKey: parts.brand?.logoKey ?? null,
    botUsername: typeof botUsername === 'string' ? botUsername : null,
  };
}
