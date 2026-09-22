/**
 * Веб-ролі й області доступу (ТЗ 2, FR-AUTH-03, ADR-9). Працівники в панель не входять.
 */

// Declaration order preserves the PostgreSQL enum order.
export const WebRole = {
  PRODUCTION_HEAD: 'PRODUCTION_HEAD',
  PLANNER: 'PLANNER',
  HR: 'HR',
  SHIFT_MASTER: 'SHIFT_MASTER',
  CLEANLINESS_CONTROLLER: 'CLEANLINESS_CONTROLLER',
  ACCOUNTANT: 'ACCOUNTANT',
  ADMIN: 'ADMIN',
  AUDITOR: 'AUDITOR',
} as const;
export const WEB_ROLES = [
  WebRole.ADMIN,
  WebRole.PRODUCTION_HEAD,
  WebRole.HR,
  WebRole.PLANNER,
  WebRole.SHIFT_MASTER,
  WebRole.CLEANLINESS_CONTROLLER,
  WebRole.ACCOUNTANT,
  WebRole.AUDITOR,
] as const;
export type WebRole = (typeof WebRole)[keyof typeof WebRole];

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
