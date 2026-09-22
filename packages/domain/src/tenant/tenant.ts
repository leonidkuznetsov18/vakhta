/**
 * Tenants: one client company on the platform (specs/011-multi-tenant-control-plane). Pure rules
 * shared by the registry, the control service, the tenant API and the worker.
 */

export const TENANT_STATUSES = [
  'DRAFT',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export const TenantStatus = {
  DRAFT: 'DRAFT',
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
} as const satisfies Record<TenantStatus, TenantStatus>;

/** `SUPPORT_BOT` and `PHOTO_INSPECTION` are reserved for later programs; enabling them has no effect yet. */
export const TENANT_MODULES = [
  'ADMIN_PANEL',
  'WORKER_BOT',
  'QR_KIOSK',
  'SUPPORT_BOT',
  'PHOTO_INSPECTION',
] as const;
export type TenantModule = (typeof TENANT_MODULES)[number];
export const TenantModule = {
  ADMIN_PANEL: 'ADMIN_PANEL',
  WORKER_BOT: 'WORKER_BOT',
  QR_KIOSK: 'QR_KIOSK',
  SUPPORT_BOT: 'SUPPORT_BOT',
  PHOTO_INSPECTION: 'PHOTO_INSPECTION',
} as const satisfies Record<TenantModule, TenantModule>;
export const DELIVERED_TENANT_MODULES = [
  TenantModule.ADMIN_PANEL,
  TenantModule.WORKER_BOT,
  TenantModule.QR_KIOSK,
] as const;

export const TENANT_SURFACES = ['PANEL', 'KIOSK', 'API'] as const;
export type TenantSurface = (typeof TENANT_SURFACES)[number];
export const TenantSurface = {
  PANEL: 'PANEL',
  KIOSK: 'KIOSK',
  API: 'API',
} as const satisfies Record<TenantSurface, TenantSurface>;

export const TENANT_DOMAIN_STATUSES = ['PENDING', 'VERIFIED', 'FAILED'] as const;
export type TenantDomainStatus = (typeof TENANT_DOMAIN_STATUSES)[number];
export const TenantDomainStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
} as const satisfies Record<TenantDomainStatus, TenantDomainStatus>;

export const TENANT_SECRET_KINDS = ['DATABASE_URL', 'BOT_TOKEN', 'BOT_WEBHOOK_SECRET'] as const;
export type TenantSecretKind = (typeof TENANT_SECRET_KINDS)[number];
export const TenantSecretKind = {
  DATABASE_URL: 'DATABASE_URL',
  BOT_TOKEN: 'BOT_TOKEN',
  BOT_WEBHOOK_SECRET: 'BOT_WEBHOOK_SECRET',
} as const satisfies Record<TenantSecretKind, TenantSecretKind>;

/** `env` builds one tenant from the process environment; `registry` reads the control database. */
export const TENANCY_MODES = ['env', 'registry'] as const;
export type TenancyMode = (typeof TENANCY_MODES)[number];
export const TenancyMode = {
  ENV: 'env',
  REGISTRY: 'registry',
} as const satisfies Record<'ENV' | 'REGISTRY', TenancyMode>;

/** Labels that would collide with platform hostnames. */
export const RESERVED_TENANT_SLUGS = [
  'api',
  'kiosk',
  'panel',
  'control',
  'control-api',
  'www',
  'mail',
  'admin',
  'static',
  'cdn',
] as const;

export const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export const TENANT_SLUG_PROBLEMS = ['EMPTY', 'FORMAT', 'RESERVED'] as const;
export type TenantSlugProblem = (typeof TENANT_SLUG_PROBLEMS)[number];
export const TenantSlugProblem = {
  EMPTY: 'EMPTY',
  FORMAT: 'FORMAT',
  RESERVED: 'RESERVED',
} as const satisfies Record<TenantSlugProblem, TenantSlugProblem>;

const RESERVED = new Set<string>(RESERVED_TENANT_SLUGS);

export function tenantSlugProblem(slug: string): TenantSlugProblem | null {
  if (slug.length === 0) return TenantSlugProblem.EMPTY;
  if (!TENANT_SLUG_PATTERN.test(slug)) return TenantSlugProblem.FORMAT;
  if (RESERVED.has(slug)) return TenantSlugProblem.RESERVED;
  return null;
}

export function isValidTenantSlug(slug: string): boolean {
  return tenantSlugProblem(slug) === null;
}

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'iu',
  я: 'ia',
};

/** A slug suggestion from a client name: transliterated, lowercase, hyphenated, bounded. */
export function suggestTenantSlug(name: string): string {
  const latin = [...name.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('');
  const collapsed = latin
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  if (collapsed.length < 3) return collapsed.padEnd(3, '0');
  return collapsed;
}

const TENANT_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  DRAFT: [TenantStatus.PROVISIONING, TenantStatus.ARCHIVED],
  PROVISIONING: [TenantStatus.ACTIVE, TenantStatus.DRAFT, TenantStatus.ARCHIVED],
  ACTIVE: [TenantStatus.SUSPENDED, TenantStatus.ARCHIVED],
  SUSPENDED: [TenantStatus.ACTIVE, TenantStatus.ARCHIVED],
  ARCHIVED: [],
};

export function canTransitionTenant(from: TenantStatus, to: TenantStatus): boolean {
  return TENANT_TRANSITIONS[from].includes(to);
}

/** Tenants that serve traffic and background work. */
export function isServingTenantStatus(status: TenantStatus): boolean {
  return status === TenantStatus.ACTIVE;
}

export function tenantDatabaseName(slug: string): string {
  return `vakhta_t_${slug.replace(/-/g, '_')}`;
}

export function tenantStoragePrefix(slug: string): string {
  return `tenants/${slug}/`;
}

export function tenantRedisPrefix(tenantId: string): string {
  return `t:${tenantId}:`;
}

/** Lowercase host without port or trailing dot, as stored in tenant_domains. */
export function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  const withoutPort = trimmed.startsWith('[')
    ? trimmed.replace(/\]:\d+$/, ']')
    : trimmed.replace(/:\d+$/, '');
  return withoutPort.replace(/\.$/, '');
}
