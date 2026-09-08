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

/** Roles allowed to review a zone handover; a shift master among them is scoped to their unit(s). */
export const HANDOVER_REVIEW_ROLES: readonly WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
];

/**
 * Which org units a reviewer may see for the given roles (2026-09-08): a shift master is bound to
 * their unit and sees only its handovers. Returns null when the person is not unit-restricted for
 * any of the roles — an ENTERPRISE or SITE grant — meaning "all units". Otherwise the set of unit
 * ids from their ORG_UNIT grants; an empty set means a master with no unit yet, who sees nothing.
 */
export function reviewableUnitIds(
  grants: readonly RoleGrant[],
  roles: readonly WebRole[] = HANDOVER_REVIEW_ROLES,
): ReadonlySet<string> | null {
  const relevant = grants.filter((g) => roles.includes(g.role));
  if (relevant.length === 0) return new Set();
  if (relevant.some((g) => g.scopeType === 'ENTERPRISE' || g.scopeType === 'SITE')) return null;
  const units = relevant
    .filter((g) => g.scopeType === 'ORG_UNIT' && g.scopeId !== null)
    .map((g) => g.scopeId as string);
  return new Set(units);
}
