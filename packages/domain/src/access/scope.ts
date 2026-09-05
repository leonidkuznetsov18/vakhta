import type { RoleGrant, WebRole } from './roles.js';

/** Обʼєкт, до якого потрібен доступ; поля відсутні, якщо не застосовні. */
export interface ScopeTarget {
  readonly siteId?: string;
  readonly orgUnitId?: string;
  readonly teamId?: string;
  readonly zoneId?: string;
}

/** Чи покриває область призначення обʼєкт (FR-AUTH-03). Ієрархія підрозділів поки пласка. */
export function grantCovers(grant: RoleGrant, target: ScopeTarget): boolean {
  switch (grant.scopeType) {
    case 'ENTERPRISE':
      return true;
    case 'SITE':
      return grant.scopeId !== null && grant.scopeId === target.siteId;
    case 'ORG_UNIT':
      return grant.scopeId !== null && grant.scopeId === target.orgUnitId;
    case 'TEAM':
      return grant.scopeId !== null && grant.scopeId === target.teamId;
    case 'ZONE':
      return grant.scopeId !== null && grant.scopeId === target.zoneId;
  }
}

/** Є хоча б одне призначення з потрібною роллю, чия область покриває обʼєкт. */
export function canActOn(
  grants: readonly RoleGrant[],
  roles: readonly WebRole[],
  target: ScopeTarget,
): boolean {
  return grants.some((g) => roles.includes(g.role) && grantCovers(g, target));
}
