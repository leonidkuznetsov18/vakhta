import { Controller, Get, Inject, NotFoundException, Query } from '@nestjs/common';
import { TenantStatus, TenantSurface, normalizeHost } from '@vakhta/domain';
import { primaryHost, type RegistryTenantSource } from '@vakhta/registry';
import type { TenantPublicConfig } from '@vakhta/contracts';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, TENANT_SOURCE } from '../infra/registry.module.js';

/**
 * Unauthenticated: what a panel or kiosk needs before sign-in (spec AC-020). Only public facts
 * leave: hosts, display name, modules, status. Never secrets, never the database.
 */
@Controller('public')
export class PublicController {
  constructor(
    @Inject(TENANT_SOURCE) private readonly source: RegistryTenantSource,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
  ) {}

  @Get('tenant-config')
  tenantConfig(@Query('host') host: string | undefined): TenantPublicConfig {
    const tenant = host ? this.source.byHost(normalizeHost(host)) : null;
    if (!tenant) throw new NotFoundException({ code: 'TENANT_NOT_FOUND' });
    const surface =
      tenant.domains.find((d) => d.host === normalizeHost(host ?? ''))?.surface ??
      TenantSurface.PANEL;
    const apiHost = primaryHost(tenant, TenantSurface.API);
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      surface,
      apiUrl: `${this.env.PLATFORM_SCHEME}://${apiHost ?? 'api.invalid'}`,
      displayName: tenant.branding.displayName,
      logoUrl: null,
      accentColor: tenant.branding.accentColor,
      defaultLocale: tenant.defaultLocale,
      modules: [...tenant.modules],
      status: tenant.status === TenantStatus.SUSPENDED ? 'SUSPENDED' : 'ACTIVE',
    };
  }
}
