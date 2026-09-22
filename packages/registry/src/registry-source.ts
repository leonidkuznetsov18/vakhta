import { eq, inArray, ne, sql } from 'drizzle-orm';
import {
  TenantDomainStatus,
  TenantModule,
  TenantSecretKind,
  TenantStatus,
  normalizeHost,
} from '@vakhta/domain';
import type { RegistryDatabase } from './client.js';
import {
  redisPrefixFor,
  type TenantBrandingConfig,
  type TenantDomainConfig,
  type TenantRuntimeConfig,
} from './runtime-config.js';
import {
  tenantBranding,
  tenantDomains,
  tenantModules,
  tenantSecrets,
  tenants,
} from './schema/index.js';
import type { SecretCipher } from './secrets.js';
import { TenantSnapshot, type TenantSource } from './source.js';

interface Watermark {
  readonly updatedAt: string | null;
  readonly total: number;
}

export interface RegistryTenantSourceOptions {
  readonly refreshEverySeconds?: number;
  readonly onError?: (error: unknown) => void;
}

/**
 * `TENANCY_MODE=registry`: tenants from the control database. The snapshot is rebuilt when
 * `max(tenants.updated_at)` or the row count changes, on an interval and on demand (`refresh`).
 * A tenant without a database secret is skipped: it cannot serve anything yet.
 */
export class RegistryTenantSource implements TenantSource {
  version = 0;
  private snapshot = new TenantSnapshot([]);
  private watermark: Watermark = { updatedAt: null, total: -1 };
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly db: RegistryDatabase,
    private readonly cipher: SecretCipher,
    private readonly options: RegistryTenantSourceOptions = {},
  ) {}

  byHost(host: string): TenantRuntimeConfig | null {
    return this.snapshot.byHost(normalizeHost(host));
  }
  byId(id: string): TenantRuntimeConfig | null {
    return this.snapshot.byId(id);
  }
  bySlug(slug: string): TenantRuntimeConfig | null {
    return this.snapshot.bySlug(slug);
  }
  active(): readonly TenantRuntimeConfig[] {
    return this.snapshot.active();
  }
  all(): readonly TenantRuntimeConfig[] {
    return this.snapshot.tenants;
  }

  async withActiveTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`provision:${tenantId}`}, 0))`,
      );
      const [tenant] = await tx
        .select({ status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      if (tenant?.status !== TenantStatus.ACTIVE) return null;
      return operation();
    });
  }

  /** Loads when the watermark moved; concurrent callers share one load. */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.reloadIfChanged().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Unconditional reload: used after a known write in the same process. */
  async reload(): Promise<void> {
    const watermark = await this.readWatermark();
    this.snapshot = new TenantSnapshot(await this.loadTenants());
    this.watermark = watermark;
    this.version += 1;
  }

  start(): void {
    if (this.timer) return;
    const everyMs = (this.options.refreshEverySeconds ?? 15) * 1000;
    this.timer = setInterval(() => {
      this.refresh().catch((error: unknown) => this.options.onError?.(error));
    }, everyMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async reloadIfChanged(): Promise<void> {
    const watermark = await this.readWatermark();
    if (
      watermark.updatedAt === this.watermark.updatedAt &&
      watermark.total === this.watermark.total
    ) {
      return;
    }
    await this.reload();
  }

  /** Any write to a tenant or its secrets, domains, modules or branding moves the watermark. */
  private async readWatermark(): Promise<Watermark> {
    const [row] = await this.db
      .select({
        updatedAt: sql<string | null>`greatest(
          (SELECT max(${tenants.updatedAt}) FROM ${tenants}),
          (SELECT max(${tenantSecrets.updatedAt}) FROM ${tenantSecrets}),
          (SELECT max(${tenantBranding.updatedAt}) FROM ${tenantBranding}))::text`,
        total: sql<number>`(SELECT count(*) FROM ${tenants} WHERE ${tenants.status} <> 'ARCHIVED')
          + (SELECT count(*) FROM ${tenantDomains})
          + (SELECT count(*) FROM ${tenantModules} WHERE ${tenantModules.status} = 'ENABLED')`,
      })
      .from(sql`(SELECT 1) AS one`);
    return { updatedAt: row?.updatedAt ?? null, total: Number(row?.total ?? 0) };
  }

  private async loadTenants(): Promise<TenantRuntimeConfig[]> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(ne(tenants.status, TenantStatus.ARCHIVED));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [modules, domains, secrets, branding] = await Promise.all([
      this.db
        .select()
        .from(tenantModules)
        .where(
          sql`${inArray(tenantModules.tenantId, ids)} AND ${eq(tenantModules.status, 'ENABLED')}`,
        ),
      this.db.select().from(tenantDomains).where(inArray(tenantDomains.tenantId, ids)),
      this.db.select().from(tenantSecrets).where(inArray(tenantSecrets.tenantId, ids)),
      this.db.select().from(tenantBranding).where(inArray(tenantBranding.tenantId, ids)),
    ]);
    const parts: TenantParts = {
      modulesBy: groupBy(modules, (m) => m.tenantId),
      domainsBy: groupBy(domains, (d) => d.tenantId),
      secretsBy: groupBy(secrets, (s) => s.tenantId),
      brandingBy: new Map(branding.map((b) => [b.tenantId, b])),
    };
    const result: TenantRuntimeConfig[] = [];
    for (const row of rows) {
      const tenant = this.buildTenant(row, parts);
      if (tenant) result.push(tenant);
    }
    return result;
  }

  private buildTenant(row: TenantRow, parts: TenantParts): TenantRuntimeConfig | null {
    const secretValues = this.decryptSecrets(parts.secretsBy.get(row.id) ?? []);
    const databaseUrl = secretValues.get(TenantSecretKind.DATABASE_URL);
    if (!databaseUrl) return null;
    const modules = parts.modulesBy.get(row.id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      defaultLocale: row.defaultLocale,
      timezone: row.timezone,
      storagePrefix: row.storagePrefix,
      redisPrefix: redisPrefixFor(row.id),
      databaseUrl,
      botToken: secretValues.get(TenantSecretKind.BOT_TOKEN) ?? null,
      botUsername: botUsernameOf(modules),
      webhookSecret: secretValues.get(TenantSecretKind.BOT_WEBHOOK_SECRET) ?? null,
      modules: modules.map((m) => m.module),
      domains: verifiedDomains(parts.domainsBy.get(row.id) ?? []),
      branding: brandingOf(row, parts.brandingBy.get(row.id)),
    };
  }

  private decryptSecrets(rows: readonly SecretRow[]): Map<string, string> {
    const values = new Map<string, string>();
    for (const secret of rows) {
      values.set(
        secret.kind,
        this.cipher.decrypt({ ciphertext: secret.ciphertext, keyVersion: secret.keyVersion }),
      );
    }
    return values;
  }
}

type TenantRow = typeof tenants.$inferSelect;
type ModuleRow = typeof tenantModules.$inferSelect;
type DomainRow = typeof tenantDomains.$inferSelect;
type SecretRow = typeof tenantSecrets.$inferSelect;
type BrandingRow = typeof tenantBranding.$inferSelect;

interface TenantParts {
  readonly modulesBy: Map<string, ModuleRow[]>;
  readonly domainsBy: Map<string, DomainRow[]>;
  readonly secretsBy: Map<string, SecretRow[]>;
  readonly brandingBy: Map<string, BrandingRow>;
}

function botUsernameOf(modules: readonly ModuleRow[]): string | null {
  const bot = modules.find((m) => m.module === TenantModule.WORKER_BOT);
  const username = bot?.config['botUsername'];
  return typeof username === 'string' ? username : null;
}

function brandingOf(row: TenantRow, brand: BrandingRow | undefined): TenantBrandingConfig {
  return {
    displayName: brand?.displayName ?? row.name,
    logoKey: brand?.logoKey ?? null,
    accentColor: brand?.accentColor ?? null,
  };
}

function verifiedDomains(rows: readonly DomainRow[]): TenantDomainConfig[] {
  return rows
    .filter((d) => d.status === TenantDomainStatus.VERIFIED)
    .map((d) => ({ host: d.host, surface: d.surface, isPrimary: d.isPrimary, status: d.status }));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
