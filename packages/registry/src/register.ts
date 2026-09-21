import { ENV_TENANT_ID } from './runtime-config.js';
import { eq } from 'drizzle-orm';
import {
  TenantDomainStatus,
  TenantModule,
  TenantSecretKind,
  TenantStatus,
  TenantSurface,
  normalizeHost,
  tenantDatabaseName,
  tenantSlugProblem,
  tenantStoragePrefix,
  type Locale,
  type TenantModule as TenantModuleCode,
} from '@vakhta/domain';
import type { RegistryDatabase } from './client.js';
import {
  controlAuditLog,
  tenantBranding,
  tenantDomains,
  tenantModules,
  tenantSecrets,
  tenants,
} from './schema/index.js';
import type { SecretCipher } from './secrets.js';

export interface RegisterExistingTenantInput {
  readonly legacyEnv?: boolean | undefined;
  readonly slug: string;
  readonly name: string;
  readonly displayName?: string | undefined;
  readonly timezone: string;
  readonly defaultLocale: Locale;
  readonly databaseUrl: string;
  /** The pilot keeps its historical unprefixed keys; new tenants get `tenants/<slug>/`. */
  readonly storagePrefix?: string | undefined;
  readonly databaseName?: string | undefined;
  readonly botToken?: string | undefined;
  readonly botUsername?: string | undefined;
  readonly webhookSecret?: string | undefined;
  readonly panelHost?: string | undefined;
  readonly kioskHost?: string | undefined;
  readonly apiHost: string;
  readonly modules?: readonly TenantModuleCode[] | undefined;
  readonly actorEmail?: string | undefined;
}

export interface RegisteredTenant {
  readonly id: string;
  readonly slug: string;
}

/**
 * Registers a tenant that already has a migrated database (the pilot cutover, or a database
 * provisioned by hand). Refuses an existing slug: updates go through the control service.
 */
export async function registerExistingTenant(
  db: RegistryDatabase,
  cipher: SecretCipher,
  input: RegisterExistingTenantInput,
): Promise<RegisteredTenant> {
  await assertSlugAvailable(db, input.slug);
  const modules = input.modules ?? [
    TenantModule.ADMIN_PANEL,
    TenantModule.WORKER_BOT,
    TenantModule.QR_KIOSK,
  ];
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        ...(input.legacyEnv ? { id: ENV_TENANT_ID } : {}),
        slug: input.slug,
        name: input.name,
        status: TenantStatus.ACTIVE,
        defaultLocale: input.defaultLocale,
        timezone: input.timezone,
        storagePrefix: input.legacyEnv
          ? ''
          : (input.storagePrefix ?? tenantStoragePrefix(input.slug)),
        databaseName: input.databaseName ?? tenantDatabaseName(input.slug),
      })
      .returning({ id: tenants.id, slug: tenants.slug });
    if (!tenant) throw new Error('tenants: insert returned no row');

    await tx
      .insert(tenantBranding)
      .values({ tenantId: tenant.id, displayName: input.displayName ?? input.name });
    await tx.insert(tenantModules).values(
      modules.map((module) => ({
        tenantId: tenant.id,
        module,
        enabledAt: new Date(),
        config:
          module === TenantModule.WORKER_BOT && input.botUsername
            ? { botUsername: input.botUsername }
            : {},
      })),
    );

    const domainRows = domainRowsOf(input);
    await tx.insert(tenantDomains).values(
      domainRows.map((d) => ({
        tenantId: tenant.id,
        host: d.host,
        surface: d.surface,
        isPrimary: true,
        isManaged: false,
        status: TenantDomainStatus.VERIFIED,
        verifiedAt: new Date(),
      })),
    );

    const secrets = secretsOf(input);
    await tx.insert(tenantSecrets).values(
      secrets.map((s) => {
        const encrypted = cipher.encrypt(s.value);
        return {
          tenantId: tenant.id,
          kind: s.kind,
          ciphertext: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          fingerprint: cipher.fingerprint(s.value),
        };
      }),
    );

    await tx.insert(controlAuditLog).values(
      registrationAudit(tenant.id, input, {
        modules,
        hosts: domainRows.map((d) => d.host),
        secrets: secrets.map((s) => s.kind),
      }),
    );
    return tenant;
  });
}

interface DomainRow {
  readonly host: string;
  readonly surface: 'PANEL' | 'KIOSK' | 'API';
}

function domainRowsOf(input: RegisterExistingTenantInput): DomainRow[] {
  const rows: DomainRow[] = [{ host: normalizeHost(input.apiHost), surface: TenantSurface.API }];
  if (input.panelHost)
    rows.push({ host: normalizeHost(input.panelHost), surface: TenantSurface.PANEL });
  if (input.kioskHost)
    rows.push({ host: normalizeHost(input.kioskHost), surface: TenantSurface.KIOSK });
  return rows;
}

interface SecretValue {
  readonly kind: 'DATABASE_URL' | 'BOT_TOKEN' | 'BOT_WEBHOOK_SECRET';
  readonly value: string;
}

function secretsOf(input: RegisterExistingTenantInput): SecretValue[] {
  const secrets: SecretValue[] = [
    { kind: TenantSecretKind.DATABASE_URL, value: input.databaseUrl },
  ];
  if (input.botToken) secrets.push({ kind: TenantSecretKind.BOT_TOKEN, value: input.botToken });
  if (input.webhookSecret) {
    secrets.push({ kind: TenantSecretKind.BOT_WEBHOOK_SECRET, value: input.webhookSecret });
  }
  return secrets;
}

interface RegistrationSummary {
  readonly modules: readonly TenantModuleCode[];
  readonly hosts: readonly string[];
  readonly secrets: readonly string[];
}

function registrationAudit(
  tenantId: string,
  input: RegisterExistingTenantInput,
  summary: RegistrationSummary,
): typeof controlAuditLog.$inferInsert {
  return {
    actorEmail: input.actorEmail ?? null,
    action: 'tenant.register_existing',
    tenantId,
    objectType: 'tenant',
    objectId: tenantId,
    after: {
      slug: input.slug,
      name: input.name,
      modules: [...summary.modules],
      hosts: [...summary.hosts],
      secrets: [...summary.secrets],
    },
  };
}

async function assertSlugAvailable(db: RegistryDatabase, slug: string): Promise<void> {
  const problem = tenantSlugProblem(slug);
  if (problem) throw new Error(`Tenant slug "${slug}" is invalid: ${problem}`);
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (existing) throw new Error(`Tenant "${slug}" already exists`);
}
