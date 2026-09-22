import { BrandingErrorCode } from '@vakhta/contracts';
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  eq,
  tenants,
  tenantBranding,
  type RegistryDbOrTx,
  type RegistryDatabase,
} from '@vakhta/registry';
import { TenantStatus } from '@vakhta/domain';
import type { TenantBrandingView, UpdateTenantBrandingCommand } from '@vakhta/contracts';
import type { Operator } from '../auth/operator.guard.js';
import { ControlAudit } from '../audit/audit.service.js';
import { ControlError } from '../common/domain-error.js';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, REGISTRY } from '../infra/registry.module.js';
import { logoUrl, normalizeLogo } from './logo.js';
import { lockTenant } from '../provisioning/tenant-lock.js';
import { LogoStorage } from './logo-storage.js';

@Injectable()
export class BrandingService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    private readonly storage: LogoStorage,
    private readonly audit: ControlAudit,
  ) {}

  async get(id: string): Promise<TenantBrandingView> {
    const [row] = await this.db
      .select()
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, id));
    if (!row) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
    return this.view(row);
  }

  async update(
    id: string,
    command: UpdateTenantBrandingCommand,
    actor: Operator,
  ): Promise<TenantBrandingView> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id));
    if (!tenant) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
    const normalized = command.logo ? await normalizeLogo(command.logo) : null;
    const key = normalized
      ? `tenants/${tenant.slug}/branding/${createHash('sha256').update(normalized).digest('hex')}.webp`
      : null;
    return this.db.transaction(async (tx) => {
      await this.lockWritable(tx, id);
      const [before] = await tx
        .select()
        .from(tenantBranding)
        .where(eq(tenantBranding.tenantId, id))
        .for('update');
      if (!before) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
      if (before.updatedAt.toISOString() !== command.expectedVersion)
        throw new ControlError(
          BrandingErrorCode.VERSION_CONFLICT,
          409,
          'Branding changed; reload before saving',
        );
      const nextKey = command.logo === undefined ? before.logoKey : key;
      if (
        before.displayName === command.displayName &&
        before.accentColor === command.accentColor &&
        before.logoKey === nextKey
      )
        return this.view(before);
      if (normalized && key) await this.storage.put(key, normalized);
      const updatedAt = new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1));
      const [after] = await tx
        .update(tenantBranding)
        .set({
          displayName: command.displayName,
          accentColor: command.accentColor,
          logoKey: nextKey,
          updatedAt,
        })
        .where(eq(tenantBranding.tenantId, id))
        .returning();
      if (!after) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
      await tx.update(tenants).set({ updatedAt }).where(eq(tenants.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'tenant.branding.update',
        tenantId: id,
        objectType: 'tenant_branding',
        objectId: id,
        before: this.view(before),
        after: this.view(after),
      });
      return this.view(after);
    });
  }

  private async lockWritable(tx: RegistryDbOrTx, id: string): Promise<void> {
    if (!(await lockTenant(tx, id)))
      throw new ControlError('TENANT_BUSY', 409, 'Tenant operation is in progress');
    const [currentTenant] = await tx.select().from(tenants).where(eq(tenants.id, id)).for('update');
    if (!currentTenant || currentTenant.status === TenantStatus.ARCHIVED)
      throw new ControlError('TENANT_READ_ONLY', 409, 'Archived tenant is read-only');
  }

  async logo(id: string, version: string): Promise<Uint8Array> {
    if (!/^[a-f0-9]{64}$/.test(version))
      throw new ControlError('LOGO_NOT_FOUND', 404, 'Logo not found');
    const [row] = await this.db
      .select({ key: tenantBranding.logoKey, slug: tenants.slug, status: tenants.status })
      .from(tenantBranding)
      .innerJoin(tenants, eq(tenants.id, tenantBranding.tenantId))
      .where(eq(tenants.id, id));
    const key = row ? `tenants/${row.slug}/branding/${version}.webp` : null;
    if (!row || !key || row.status === TenantStatus.ARCHIVED || row.key !== key)
      throw new ControlError('LOGO_NOT_FOUND', 404, 'Logo not found');
    return this.storage.get(key);
  }

  private view(row: typeof tenantBranding.$inferSelect): TenantBrandingView {
    return {
      displayName: row.displayName,
      accentColor: row.accentColor,
      logoUrl: logoUrl(this.env.CONTROL_PUBLIC_BASE_URL, row.tenantId, row.logoKey),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
