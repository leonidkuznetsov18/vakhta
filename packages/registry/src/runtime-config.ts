import type {
  Locale,
  TenantDomainStatus,
  TenantModule,
  TenantStatus,
  TenantSurface,
} from '@vakhta/domain';
import {
  TenantDomainStatus as DomainStatus,
  TenantModule as Module,
  TenantStatus as Status,
  TenantSurface as Surface,
  normalizeHost,
  tenantRedisPrefix,
} from '@vakhta/domain';

export interface TenantDomainConfig {
  readonly host: string;
  readonly surface: TenantSurface;
  readonly isPrimary: boolean;
  readonly status: TenantDomainStatus;
}

export interface TenantBrandingConfig {
  readonly displayName: string;
  readonly logoKey: string | null;
  readonly accentColor: string | null;
}

/**
 * Everything a process needs to serve one tenant. Contains decrypted secrets: it never crosses a
 * process boundary, never enters a log line and never reaches a client.
 */
export interface TenantRuntimeConfig {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly defaultLocale: Locale;
  readonly timezone: string;
  readonly storagePrefix: string;
  readonly redisPrefix: string;
  readonly databaseUrl: string;
  readonly botToken: string | null;
  readonly botUsername: string | null;
  readonly webhookSecret: string | null;
  readonly modules: readonly TenantModule[];
  readonly domains: readonly TenantDomainConfig[];
  readonly branding: TenantBrandingConfig;
}

export function tenantHasModule(tenant: TenantRuntimeConfig, module: TenantModule): boolean {
  return tenant.modules.includes(module);
}

export function primaryHost(tenant: TenantRuntimeConfig, surface: TenantSurface): string | null {
  const primary = tenant.domains.find((d) => d.surface === surface && d.isPrimary);
  return primary?.host ?? tenant.domains.find((d) => d.surface === surface)?.host ?? null;
}

/** Origins allowed to call the tenant API with credentials: its verified panel and kiosk hosts. */
export function tenantOrigins(tenant: TenantRuntimeConfig, scheme: 'https' | 'http'): string[] {
  return tenant.domains
    .filter((d) => d.surface !== Surface.API && d.status === DomainStatus.VERIFIED)
    .map((d) => `${scheme}://${d.host}`);
}

/** Fixed identity of the environment-defined tenant: stable across restarts and both apps. */
export const ENV_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const ENV_TENANT_SLUG = 'default';

export interface EnvTenantInput {
  readonly DATABASE_URL: string;
  readonly PUBLIC_BASE_URL?: string | undefined;
  readonly CORS_ORIGINS?: readonly string[] | undefined;
  readonly TELEGRAM_BOT_TOKEN?: string | undefined;
  readonly TELEGRAM_BOT_USERNAME?: string | undefined;
  readonly TELEGRAM_WEBHOOK_SECRET?: string | undefined;
  readonly DEFAULT_SITE_TIMEZONE?: string | undefined;
  readonly TELEGRAM_SUPPORT_BOT_TOKEN?: string | undefined;
  readonly TENANT_DISPLAY_NAME?: string | undefined;
}

function hostOf(url: string): string | null {
  try {
    return normalizeHost(new URL(url).host);
  } catch {
    return null;
  }
}

/**
 * `TENANCY_MODE=env`: the single tenant the current deployment already serves, built from the
 * same variables as before. Its hosts come from PUBLIC_BASE_URL and CORS_ORIGINS; requests are
 * bound to it regardless of host, which keeps local development and the pilot unchanged.
 */
export function tenantFromEnv(env: EnvTenantInput): TenantRuntimeConfig {
  const displayName = env.TENANT_DISPLAY_NAME ?? 'Vakhta';
  return {
    id: ENV_TENANT_ID,
    slug: ENV_TENANT_SLUG,
    name: displayName,
    status: Status.ACTIVE,
    defaultLocale: 'ru',
    timezone: env.DEFAULT_SITE_TIMEZONE ?? 'Europe/Kyiv',
    storagePrefix: '',
    redisPrefix: '',
    databaseUrl: env.DATABASE_URL,
    botToken: env.TELEGRAM_BOT_TOKEN ?? null,
    botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? null,
    modules: envModules(env),
    domains: envDomains(env),
    branding: { displayName, logoKey: null, accentColor: null },
  };
}

function envModules(env: EnvTenantInput): TenantModule[] {
  const modules: TenantModule[] = [Module.ADMIN_PANEL, Module.WORKER_BOT, Module.QR_KIOSK];
  if (env.TELEGRAM_SUPPORT_BOT_TOKEN) modules.push(Module.SUPPORT_BOT);
  return modules;
}

/** API host from PUBLIC_BASE_URL; the first CORS origin is the panel, the second the kiosk. */
function envDomains(env: EnvTenantInput): TenantDomainConfig[] {
  const domains: TenantDomainConfig[] = [];
  const apiHost = env.PUBLIC_BASE_URL ? hostOf(env.PUBLIC_BASE_URL) : null;
  if (apiHost) {
    domains.push({
      host: apiHost,
      surface: Surface.API,
      isPrimary: true,
      status: DomainStatus.VERIFIED,
    });
  }
  (env.CORS_ORIGINS ?? []).forEach((origin, index) => {
    const host = hostOf(origin);
    if (!host) return;
    const surface = index === 0 ? Surface.PANEL : Surface.KIOSK;
    domains.push({ host, surface, isPrimary: index < 2, status: DomainStatus.VERIFIED });
  });
  return domains;
}

/** Registry tenants get prefixed Redis keys; the env tenant keeps the historical unprefixed keys. */
export function redisPrefixFor(tenantId: string): string {
  return tenantId === ENV_TENANT_ID ? '' : tenantRedisPrefix(tenantId);
}
