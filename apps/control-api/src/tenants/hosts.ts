import { TenantSurface, normalizeHost, type TenantSurface as Surface } from '@vakhta/domain';
import type { ControlEnv } from '../config/env.js';

export interface ManagedHost {
  readonly surface: Surface;
  readonly host: string;
  readonly cnameTarget: string;
}

type HostEnv = Pick<
  ControlEnv,
  | 'PANEL_HOST_PATTERN'
  | 'KIOSK_HOST_PATTERN'
  | 'API_HOST_PATTERN'
  | 'PANEL_CNAME_TARGET'
  | 'KIOSK_CNAME_TARGET'
  | 'API_CNAME_TARGET'
>;

function fill(pattern: string, slug: string): string {
  return normalizeHost(pattern.replace('{slug}', slug));
}

/** The three managed hostnames of a tenant, derived from the slug and the platform patterns. */
export function managedHosts(env: HostEnv, slug: string): ManagedHost[] {
  return [
    {
      surface: TenantSurface.PANEL,
      host: fill(env.PANEL_HOST_PATTERN, slug),
      cnameTarget: env.PANEL_CNAME_TARGET,
    },
    {
      surface: TenantSurface.KIOSK,
      host: fill(env.KIOSK_HOST_PATTERN, slug),
      cnameTarget: env.KIOSK_CNAME_TARGET,
    },
    {
      surface: TenantSurface.API,
      host: fill(env.API_HOST_PATTERN, slug),
      cnameTarget: env.API_CNAME_TARGET,
    },
  ];
}
