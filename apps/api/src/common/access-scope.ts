import {
  eq,
  getTableName,
  inArray,
  or,
  orgUnits,
  responsibilityZones,
  sql,
  teams,
  type AnyColumn,
  type Database,
  type SQL,
  type SQLWrapper,
} from '@vakhta/db';

import {
  accessScope,
  scopeCovers,
  type AccessScope,
  type ScopeTarget,
  type WebRole,
} from '@vakhta/domain';
import { catchError, filter, from, map, mergeMap, of, type Observable } from 'rxjs';
import { DomainError } from './domain-error.js';

/** Everything: services called by the bot, jobs and tests that are not bound to a panel user. */
export const FULL_SCOPE: AccessScope = { all: true };

/** The read scope of a panel user for the roles an endpoint admits (role and scope of one grant). */
export function scopeOf(
  user: { readonly grants: Parameters<typeof accessScope>[0] },
  roles: readonly WebRole[],
): AccessScope {
  return accessScope(user.grants, roles);
}

/** Columns that place a row; a dimension the query cannot place is simply not offered. */
export interface ScopeColumns {
  readonly site?: SQLWrapper;
  readonly unit?: SQLWrapper;
  readonly team?: SQLWrapper;
  readonly zone?: SQLWrapper;
}

/**
 * SQL condition limiting rows to a scope: undefined for everything, `false` for an empty scope,
 * otherwise rows placed in any granted site, unit, team or zone. A row whose place is unknown
 * (null column) is not visible to a scoped reader.
 */
export function scopeCondition(scope: AccessScope, cols: ScopeColumns): SQL | undefined {
  if (scope.all) return undefined;
  const parts: SQL[] = [];
  const add = (col: SQLWrapper | undefined, ids: readonly string[]) => {
    if (col && ids.length > 0) parts.push(inArray(col as never, [...ids]));
  };
  add(cols.site, scope.siteIds);
  add(cols.unit, scope.orgUnitIds);
  add(cols.team, scope.teamIds);
  add(cols.zone, scope.zoneIds);
  if (parts.length === 0) return sql`false`;
  return parts.length === 1 ? parts[0] : or(...parts);
}

/** A direct identifier outside the reader's scope is forbidden, not an empty success. */
export function assertInScope(scope: AccessScope, target: ScopeTarget | null): void {
  if (scope.all) return;
  if (!target || !scopeCovers(scope, target)) {
    throw new DomainError('OUT_OF_SCOPE', 403, 'The record is outside your access scope');
  }
}

/** Plain place of a row as returned by a lookup, with nulls dropped for `scopeCovers`. */
export function placeTarget(place: {
  readonly siteId?: string | null;
  readonly orgUnitId?: string | null;
  readonly teamId?: string | null;
  readonly zoneId?: string | null;
}): ScopeTarget {
  return {
    ...(place.siteId ? { siteId: place.siteId } : {}),
    ...(place.orgUnitId ? { orgUnitId: place.orgUnitId } : {}),
    ...(place.teamId ? { teamId: place.teamId } : {}),
    ...(place.zoneId ? { zoneId: place.zoneId } : {}),
  };
}

/**
 * Live events limited to a scope. Each event names only an identifier, so its place is looked up;
 * a lookup failure drops that notification (the panel's polling fallback still refreshes) rather
 * than leaking an event of unknown place or ending the subscriber's stream.
 */
export function scopedEvents<T>(
  events: Observable<T>,
  scope: AccessScope,
  placeOf: (event: T) => Promise<ScopeTarget | null>,
): Observable<T> {
  if (scope.all) return events;
  return events.pipe(
    mergeMap((event) =>
      from(placeOf(event)).pipe(
        map((place) => (place && scopeCovers(scope, place) ? event : null)),
        catchError(() => of(null)),
      ),
    ),
    filter((event: T | null): event is T => event !== null),
  );
}

/**
 * Place of an employee by their open position, as SQL expressions over an employee id column:
 * requests and summaries have no unit of their own, the person's current post decides it.
 */
export function employeePlaceSql(employeeId: AnyColumn): {
  readonly site: SQL<string | null>;
  readonly unit: SQL<string | null>;
  readonly team: SQL<string | null>;
  readonly zone: SQL<string | null>;
} {
  // Always table-qualified: in a single-table select drizzle renders a bare column name, which the
  // subquery would bind to its own p.employee_id and match every position.
  const person = sql.raw(`"${getTableName(employeeId.table)}"."${employeeId.name}"`);
  const current = (column: SQL) =>
    sql<
      string | null
    >`(select ${column} from employee_positions p join org_units u on u.id = p.org_unit_id
      where p.employee_id = ${person} and p.valid_from <= now() and (p.valid_to is null or p.valid_to > now()) order by p.valid_from desc limit 1)`;
  return {
    site: current(sql.raw('u.site_id')),
    unit: current(sql.raw('p.org_unit_id')),
    team: current(sql.raw('p.team_id')),
    zone: sql<string | null>`null::uuid`,
  };
}

/**
 * A filter the reader asks for by identifier (site, unit, zone) must lie inside the scope or
 * contain a granted place: a unit master may filter by their own site, never by another one.
 * Outside the scope it is forbidden rather than answered with an empty list (spec 004 AC-002).
 */
export async function assertFiltersInScope(
  db: Database,
  scope: AccessScope,
  filters: {
    readonly siteId?: string | undefined;
    readonly orgUnitId?: string | undefined;
    readonly zoneId?: string | undefined;
  },
): Promise<void> {
  if (scope.all) return;
  const forbid = () => {
    throw new DomainError('OUT_OF_SCOPE', 403, 'The filter is outside your access scope');
  };
  const [grantedZones, grantedTeams, grantedUnits] = await Promise.all([
    scope.zoneIds.length
      ? db
          .select({ siteId: responsibilityZones.siteId, orgUnitId: responsibilityZones.orgUnitId })
          .from(responsibilityZones)
          .where(inArray(responsibilityZones.id, [...scope.zoneIds]))
      : [],
    scope.teamIds.length
      ? db
          .select({ orgUnitId: teams.orgUnitId, siteId: orgUnits.siteId })
          .from(teams)
          .innerJoin(orgUnits, eq(teams.orgUnitId, orgUnits.id))
          .where(inArray(teams.id, [...scope.teamIds]))
      : [],
    scope.orgUnitIds.length
      ? db
          .select({ siteId: orgUnits.siteId })
          .from(orgUnits)
          .where(inArray(orgUnits.id, [...scope.orgUnitIds]))
      : [],
  ]);
  if (filters.siteId) {
    const sitesInScope = new Set([
      ...scope.siteIds,
      ...grantedUnits.map((u) => u.siteId),
      ...grantedZones.map((z) => z.siteId),
      ...grantedTeams.map((t) => t.siteId),
    ]);
    if (!sitesInScope.has(filters.siteId)) forbid();
  }
  if (filters.orgUnitId) {
    const [unit] = await db
      .select({ siteId: orgUnits.siteId })
      .from(orgUnits)
      .where(eq(orgUnits.id, filters.orgUnitId))
      .limit(1);
    const reachable =
      !!unit &&
      (scope.siteIds.includes(unit.siteId) ||
        scope.orgUnitIds.includes(filters.orgUnitId) ||
        grantedZones.some((z) => z.orgUnitId === filters.orgUnitId) ||
        grantedTeams.some((t) => t.orgUnitId === filters.orgUnitId));
    if (!reachable) forbid();
  }
  if (filters.zoneId) {
    const [zone] = await db
      .select({ siteId: responsibilityZones.siteId, orgUnitId: responsibilityZones.orgUnitId })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, filters.zoneId))
      .limit(1);
    if (!zone || !scopeCovers(scope, { ...zone, zoneId: filters.zoneId })) forbid();
  }
}
