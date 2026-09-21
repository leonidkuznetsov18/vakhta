import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_SETTING_DEFAULTS,
  TENANT_SETTING_KEYS,
  TENANT_SETTING_PREFIX,
  TENANT_SETTING_SCOPE,
  TenantSettings,
  resolveTenantSettings,
  tenantSettingRowKey,
  tenantSettingsProblems,
  type TenantSettingKey,
  type TenantSettingsView,
  type UpdateTenantSettingsCommand,
} from '@vakhta/contracts';
import {
  and,
  createDatabase,
  eq,
  inArray,
  lockTenantSettingsWithin,
  readTenantSettingRows,
  settings,
  sql,
  type Transaction,
} from '@vakhta/db';
import { TenantSecretKind } from '@vakhta/domain';
import {
  and as registryAnd,
  eq as registryEq,
  tenantSecrets,
  type RegistryDatabase,
  type SecretCipher,
} from '@vakhta/registry';
import { ControlAudit } from '../audit/audit.service.js';
import type { Operator } from '../auth/operator.guard.js';
import { ControlError } from '../common/domain-error.js';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { createLogger } from '../logger.js';
import { TenantsService } from '../tenants/tenants.service.js';

type Overrides = Partial<TenantSettings>;
type TenantDb = ReturnType<typeof createDatabase>['db'];
const KEYS = new Set<string>(TENANT_SETTING_KEYS);

function isKey(name: string): name is TenantSettingKey {
  return KEYS.has(name);
}

/** Validated change set: keys to store and keys to return to their default. */
interface SettingsChange {
  readonly set: Overrides;
  readonly reset: TenantSettingKey[];
}

function parseChange(cmd: UpdateTenantSettingsCommand): SettingsChange {
  const set: Overrides = {};
  const reset: TenantSettingKey[] = [];
  for (const [name, value] of Object.entries(cmd.values)) {
    if (!isKey(name))
      throw new ControlError('TENANT_SETTING_UNKNOWN', 422, `Unknown setting ${name}`);
    if (value === null) {
      reset.push(name);
      continue;
    }
    const parsed = TenantSettings.shape[name].safeParse(value);
    if (!parsed.success) {
      throw new ControlError('TENANT_SETTING_INVALID', 422, `Setting ${name} is out of range`);
    }
    set[name] = parsed.data;
  }
  return { set, reset };
}

function applyChange(current: Overrides, change: SettingsChange): Overrides {
  const next: Overrides = { ...current, ...change.set };
  for (const key of change.reset) delete next[key];
  return next;
}

/**
 * Operational parameters of one tenant (spec AC-026–028). Overrides live in the tenant's own
 * database; the tenant API and worker pick them up within one registry refresh, no deploy.
 */
@Injectable()
export class TenantSettingsService {
  private readonly logger;

  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CONTROL_ENV) env: ControlEnv,
    private readonly tenants: TenantsService,
    private readonly audit: ControlAudit,
  ) {
    this.logger = createLogger(env);
  }

  async get(tenantId: string): Promise<TenantSettingsView> {
    return this.withTenantDatabase(tenantId, (tenantDb) => this.read(tenantDb));
  }

  async update(
    tenantId: string,
    cmd: UpdateTenantSettingsCommand,
    actor: Operator,
  ): Promise<TenantSettingsView> {
    const change = parseChange(cmd);
    const { before, after } = await this.withTenantDatabase(tenantId, async (tenantDb) => {
      const current = await tenantDb.transaction(async (tx) => {
        await lockTenantSettingsWithin(tx);
        const stored = await currentOverrides(tx);
        assertConsistent(applyChange(stored, change));
        await writeChange(tx, change, actor);
        return stored;
      });
      return { before: current, after: await this.read(tenantDb) };
    });
    // The tenant write and the registry audit are separate databases. An audit failure after a
    // committed write is surfaced as an error, and the change is logged so it is never unrecorded.
    const entry = {
      actor,
      action: 'tenant.settings.update',
      tenantId,
      objectType: 'tenant_settings',
      objectId: tenantId,
      before: pick(before, change),
      after: { ...change.set, reset: change.reset },
    };
    await this.audit.record(this.db, entry).catch((error: unknown) => {
      this.logger.error(
        { err: error, tenantId, operator: actor.email, before: entry.before, after: entry.after },
        'Tenant settings changed but the audit entry failed',
      );
      throw error;
    });
    return after;
  }

  private async read(tenantDb: TenantDb): Promise<TenantSettingsView> {
    const resolved = resolveTenantSettings(
      TENANT_SETTING_DEFAULTS,
      await readTenantSettingRows(tenantDb),
    );
    return {
      defaults: TENANT_SETTING_DEFAULTS,
      overrides: resolved.overrides,
      effective: resolved.settings,
      invalid: [...resolved.invalid],
    };
  }

  private async withTenantDatabase<T>(
    tenantId: string,
    fn: (db: TenantDb) => Promise<T>,
  ): Promise<T> {
    await this.tenants.require(tenantId);
    const [secret] = await this.db
      .select()
      .from(tenantSecrets)
      .where(
        registryAnd(
          registryEq(tenantSecrets.tenantId, tenantId),
          registryEq(tenantSecrets.kind, TenantSecretKind.DATABASE_URL),
        ),
      )
      .limit(1);
    if (!secret) {
      throw new ControlError(
        'TENANT_DATABASE_MISSING',
        409,
        'The tenant database is not provisioned yet',
      );
    }
    const url = this.cipher.decrypt({
      ciphertext: secret.ciphertext,
      keyVersion: secret.keyVersion,
    });
    const handle = createDatabase(url, { max: 1 });
    try {
      return await fn(handle.db);
    } finally {
      await handle.client.end({ timeout: 5 });
    }
  }
}

async function currentOverrides(tx: Transaction): Promise<Overrides> {
  return resolveTenantSettings(TENANT_SETTING_DEFAULTS, await readTenantSettingRows(tx)).overrides;
}

function assertConsistent(overrides: Overrides): void {
  const problems = tenantSettingsProblems({ ...TENANT_SETTING_DEFAULTS, ...overrides });
  if (problems.length === 0) return;
  throw new ControlError(
    'TENANT_SETTINGS_INCONSISTENT',
    422,
    `Inconsistent settings: ${problems.join(', ')}`,
  );
}

async function writeChange(
  tx: Transaction,
  change: SettingsChange,
  actor: Operator,
): Promise<void> {
  const now = new Date();
  const rows = Object.entries(change.set).map(([key, value]) => ({
    scope: TENANT_SETTING_SCOPE,
    key: `${TENANT_SETTING_PREFIX}${key}`,
    value,
    updatedBy: actor.email,
    updatedAt: now,
  }));
  if (rows.length > 0) {
    await tx
      .insert(settings)
      .values(rows)
      .onConflictDoUpdate({
        target: [settings.scope, settings.key],
        set: { value: sql`excluded.value`, updatedBy: actor.email, updatedAt: now },
      });
  }
  if (change.reset.length === 0) return;
  await tx
    .delete(settings)
    .where(
      and(
        eq(settings.scope, TENANT_SETTING_SCOPE),
        inArray(settings.key, change.reset.map(tenantSettingRowKey)),
      ),
    );
}

function pick(overrides: Overrides, change: SettingsChange): Record<string, unknown> {
  const keys = [...Object.keys(change.set), ...change.reset];
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = isKey(key) ? (overrides[key] ?? null) : null;
  return result;
}
