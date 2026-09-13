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

/**
 * What a person may read for the given roles, resolved from the grants that carry those roles.
 * `all` means an ENTERPRISE grant; otherwise the union of the granted sites, units, teams and zones.
 * SITE is not ENTERPRISE: it covers only its own site. No relevant grant means an empty scope.
 */
export type AccessScope =
  | { readonly all: true }
  | {
      readonly all: false;
      readonly siteIds: readonly string[];
      readonly orgUnitIds: readonly string[];
      readonly teamIds: readonly string[];
      readonly zoneIds: readonly string[];
    };

export function accessScope(grants: readonly RoleGrant[], roles: readonly WebRole[]): AccessScope {
  const relevant = grants.filter((g) => roles.includes(g.role));
  if (relevant.some((g) => g.scopeType === 'ENTERPRISE')) return { all: true };
  const ids = (type: RoleGrant['scopeType']) => [
    ...new Set(
      relevant
        .filter((g) => g.scopeType === type && g.scopeId !== null)
        .map((g) => g.scopeId as string),
    ),
  ];
  return {
    all: false,
    siteIds: ids('SITE'),
    orgUnitIds: ids('ORG_UNIT'),
    teamIds: ids('TEAM'),
    zoneIds: ids('ZONE'),
  };
}

/** Whether a resolved scope covers an object; the same rule as `grantCovers` over the union. */
export function scopeCovers(scope: AccessScope, target: ScopeTarget): boolean {
  if (scope.all) return true;
  const hit = (ids: readonly string[], id: string | undefined) =>
    id !== undefined && ids.includes(id);
  return (
    hit(scope.siteIds, target.siteId) ||
    hit(scope.orgUnitIds, target.orgUnitId) ||
    hit(scope.teamIds, target.teamId) ||
    hit(scope.zoneIds, target.zoneId)
  );
}

/** A scope with nothing in it: the person has none of the roles, or no usable grant. */
export function scopeIsEmpty(scope: AccessScope): boolean {
  return (
    !scope.all &&
    scope.siteIds.length + scope.orgUnitIds.length + scope.teamIds.length + scope.zoneIds.length ===
      0
  );
}
