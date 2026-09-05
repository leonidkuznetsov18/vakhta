/**
 * Веб-ролі й області доступу (ТЗ 2, FR-AUTH-03, ADR-9). Працівники в панель не входять.
 */

export const WEB_ROLES = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'HR',
  'PLANNER',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
] as const;
export type WebRole = (typeof WEB_ROLES)[number];

export const SCOPE_TYPES = ['ENTERPRISE', 'SITE', 'ORG_UNIT', 'TEAM', 'ZONE'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export interface RoleGrant {
  readonly role: WebRole;
  readonly scopeType: ScopeType;
  /** null лише для ENTERPRISE. */
  readonly scopeId: string | null;
}

/** Порядок «старшинства» для вибору головної ролі актора в подіях і аудиті. */
const PRECEDENCE: readonly WebRole[] = WEB_ROLES;

export function hasAnyRole(grants: readonly RoleGrant[], roles: readonly WebRole[]): boolean {
  return grants.some((g) => roles.includes(g.role));
}

export function primaryRole(grants: readonly RoleGrant[]): WebRole | null {
  for (const role of PRECEDENCE) {
    if (grants.some((g) => g.role === role)) return role;
  }
  return null;
}

/** Ролі, яким дозволено вести довідники й облікові записи. */
export const ADMIN_ROLES: readonly WebRole[] = ['ADMIN'];
/** Ролі, яким дозволено кадрові картки, коди активації, перепривʼязку (ТЗ 2.2). */
export const HR_ROLES: readonly WebRole[] = ['ADMIN', 'HR'];

export function isEnterpriseScope(grant: RoleGrant): boolean {
  return grant.scopeType === 'ENTERPRISE';
}
