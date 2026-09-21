import { z } from 'zod';
import { TenantPublicConfig } from '@vakhta/contracts';
import { TenantModule, TenantStatus, TenantSurface } from '@vakhta/domain';

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface RuntimeOptions {
  host: string;
  controlUrl: string;
  surface: typeof TenantSurface.PANEL | typeof TenantSurface.KIOSK;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
  allowHttp?: boolean;
}

export class TenantUnavailable extends Error {}

function validOrigin(address: string, allowHttp: boolean): boolean {
  const url = new URL(address);
  const protocolAllowed = url.protocol === 'https:' || (allowHttp && url.protocol === 'http:');
  return (
    protocolAllowed &&
    !url.username &&
    !url.password &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash
  );
}

function validate(value: unknown, options: RuntimeOptions): TenantPublicConfig {
  const config = TenantPublicConfig.parse(value);
  const requiredModule =
    options.surface === TenantSurface.PANEL ? TenantModule.ADMIN_PANEL : TenantModule.QR_KIOSK;
  if (
    config.surface !== options.surface ||
    config.status !== TenantStatus.ACTIVE ||
    !config.modules.includes(requiredModule)
  )
    throw new TenantUnavailable('Tenant unavailable');
  const addresses = [config.apiUrl, config.canonicalUrl, config.panelUrl, config.kioskUrl];
  for (const address of addresses) {
    if (address && !validOrigin(address, options.allowHttp ?? false)) {
      throw new TenantUnavailable('Invalid tenant origin');
    }
  }
  return config;
}

const CachedConfig = z.object({ savedAt: z.number(), config: TenantPublicConfig });
function cached(options: RuntimeOptions, key: string, now: number): TenantPublicConfig | null {
  try {
    const raw = options.storage?.getItem(key);
    if (!raw) return null;
    const saved = CachedConfig.parse(JSON.parse(raw));
    if (saved.savedAt > now || now - saved.savedAt > CACHE_TTL_MS) return null;
    return validate(saved.config, options);
  } catch {
    // Browser storage is optional; a network response still works without it.
    return null;
  }
}

function forget(options: RuntimeOptions, key: string): void {
  try {
    options.storage?.removeItem(key);
  } catch {
    /* Browser storage is optional. */
  }
}
function remember(
  options: RuntimeOptions,
  key: string,
  entry: { config: TenantPublicConfig; savedAt: number },
): void {
  try {
    options.storage?.setItem(key, JSON.stringify(entry));
  } catch {
    /* Browser storage is optional. */
  }
}
async function fetchConfig(options: RuntimeOptions): Promise<Response | null> {
  const url = new URL('/public/tenant-config', options.controlUrl);
  url.searchParams.set('host', options.host);
  try {
    return await (options.fetcher ?? fetch)(url, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // A transport failure may use a validated, recent cache for the same hostname.
    return null;
  }
}

/** Cache is host-scoped and used only during transport outages, never after an explicit refusal. */
export async function resolveTenant(options: RuntimeOptions): Promise<TenantPublicConfig> {
  const key = `vakhta.tenant.v${CACHE_VERSION}:${options.surface}:${options.host}`;
  const now = (options.now ?? Date.now)();
  const response = await fetchConfig(options);
  if (!response || response.status >= 500) {
    const config = cached(options, key, now);
    if (config) return config;
    throw new TenantUnavailable('Tenant configuration unavailable');
  }
  try {
    if (!response.ok) throw new TenantUnavailable('Tenant configuration refused');
    const config = validate(await response.json(), options);
    remember(options, key, { config, savedAt: now });
    return config;
  } catch (error) {
    forget(options, key);
    throw error;
  }
}

let runtime: TenantPublicConfig | null = null;
export function setTenantConfig(config: TenantPublicConfig): void {
  runtime = config;
}
export function tenantConfig(): TenantPublicConfig | null {
  return runtime;
}

export function browserStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}
