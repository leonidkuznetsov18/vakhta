import type { RoleGrant, WebRole } from '../access/roles.js';
import { grantCovers, type ScopeTarget } from '../access/scope.js';

/** Who prepares plans and who approves/publishes them (spec 2.1, D-01 of the calendar redesign). */
export const SCHEDULE_EDIT_ROLES: readonly WebRole[] = ['ADMIN', 'PLANNER', 'SHIFT_MASTER'];
export const SCHEDULE_APPROVE_ROLES: readonly WebRole[] = ['ADMIN', 'PRODUCTION_HEAD'];

export interface ScheduleUnitTarget extends ScopeTarget {
  readonly siteId: string;
  readonly orgUnitId: string;
}

/**
 * Zones an editor may change in the unit. `null` means the whole unit (administrator, planner or a
 * master whose grant covers the unit); an empty set means no editing authority at all. A master
 * with only ZONE grants may change assignments of those zones and nothing else.
 */
export function scheduleZoneScope(
  grants: readonly RoleGrant[],
  target: ScheduleUnitTarget,
  unitZoneIds: readonly string[],
): ReadonlySet<string> | null {
  const unitWide = grants.some(
    (grant) =>
      ((grant.role === 'ADMIN' || grant.role === 'PLANNER') && grantCovers(grant, target)) ||
      (grant.role === 'SHIFT_MASTER' &&
        grant.scopeType !== 'ZONE' &&
        grant.scopeType !== 'TEAM' &&
        grantCovers(grant, target)),
  );
  if (unitWide) return null;
  const zones = new Set(unitZoneIds);
  return new Set(
    grants
      .filter(
        (grant) =>
          grant.role === 'SHIFT_MASTER' &&
          grant.scopeType === 'ZONE' &&
          grant.scopeId !== null &&
          zones.has(grant.scopeId),
      )
      .map((grant) => grant.scopeId as string),
  );
}

export interface ZoneScopedAssignment {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly templateId: string;
  readonly zoneId?: string | null | undefined;
  readonly kind?: string | undefined;
  readonly positionId?: string | null | undefined;
  readonly teamId?: string | null | undefined;
}

function key(item: ZoneScopedAssignment): string {
  return `${item.employeeId}:${item.businessDate}`;
}
function same(a: ZoneScopedAssignment, b: ZoneScopedAssignment): boolean {
  return (
    a.templateId === b.templateId &&
    (a.zoneId ?? null) === (b.zoneId ?? null) &&
    (a.kind ?? 'REGULAR') === (b.kind ?? 'REGULAR') &&
    (a.positionId ?? null) === (b.positionId ?? null) &&
    (a.teamId ?? null) === (b.teamId ?? null)
  );
}

/**
 * Assignments a zone-scoped editor is not allowed to add, remove or change: every difference
 * between the current plan and the proposed one whose old or new zone lies outside the scope.
 * Unchanged assignments of other zones may stay in a full-month payload.
 */
export function zoneScopeViolations(
  current: readonly ZoneScopedAssignment[],
  proposed: readonly ZoneScopedAssignment[],
  zones: ReadonlySet<string>,
): string[] {
  const before = new Map(current.map((item) => [key(item), item]));
  const after = new Map(proposed.map((item) => [key(item), item]));
  const allowed = (item: ZoneScopedAssignment | undefined) =>
    item === undefined || (!!item.zoneId && zones.has(item.zoneId));
  return [...new Set([...before.keys(), ...after.keys()])].filter((id) => {
    const a = before.get(id);
    const b = after.get(id);
    if (a && b && same(a, b)) return false;
    return !allowed(a) || !allowed(b);
  });
}
