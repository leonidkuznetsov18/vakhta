import {
  and,
  authUser,
  bonusMonthClosures,
  bonusPointAwards,
  employees,
  eq,
  orgUnits,
  sql,
  webUserRoles,
  type DbOrTx,
} from '@vakhta/db';
import { MonthNominationsSnapshot } from '@vakhta/contracts';
import {
  masterNominee,
  nominateMonth,
  type MonthMasterCandidate,
  type MonthNominations,
} from '@vakhta/domain';

export interface EmployeeMonthPoints {
  readonly employeeId: string;
  readonly name: string;
  readonly points: number;
  readonly approved: number;
}

/** Aggregate once per person across all departments of the selected site. */
export async function monthEmployeePoints(
  tx: DbOrTx,
  siteId: string | null,
  month: string,
): Promise<EmployeeMonthPoints[]> {
  const rows = await tx
    .select({
      employeeId: bonusPointAwards.employeeId,
      name: employees.fullName,
      points: sql<number>`sum(${bonusPointAwards.points})::int`,
      approved: sql<number>`coalesce(sum(${bonusPointAwards.points}) filter (where ${bonusPointAwards.kind} = 'CHECKLIST_APPROVED'), 0)::int`,
    })
    .from(bonusPointAwards)
    .innerJoin(employees, eq(bonusPointAwards.employeeId, employees.id))
    .leftJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
    .where(and(eq(bonusPointAwards.month, month), siteId ? eq(orgUnits.siteId, siteId) : undefined))
    .groupBy(bonusPointAwards.employeeId, employees.fullName);
  return rows;
}

export async function liveMonthNominations(
  tx: DbOrTx,
  siteId: string | null,
  month: string,
): Promise<MonthNominations> {
  const staff = await monthEmployeePoints(tx, siteId, month);
  const units = await tx
    .select({
      id: orgUnits.id,
      name: orgUnits.name,
      points: sql<number>`sum(${bonusPointAwards.points})::int`,
    })
    .from(bonusPointAwards)
    .innerJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
    .where(
      and(
        eq(bonusPointAwards.month, month),
        eq(bonusPointAwards.kind, 'CHECKLIST_APPROVED'),
        siteId ? eq(orgUnits.siteId, siteId) : undefined,
      ),
    )
    .groupBy(orgUnits.id, orgUnits.name);
  const masterRows = await tx
    .select({
      userId: authUser.id,
      name: authUser.name,
      employeeId: employees.id,
      orgUnitId: webUserRoles.scopeId,
    })
    .from(webUserRoles)
    .innerJoin(authUser, eq(webUserRoles.userId, authUser.id))
    .innerJoin(orgUnits, eq(webUserRoles.scopeId, orgUnits.id))
    .leftJoin(
      employees,
      and(
        sql`lower(${employees.email}) = lower(${authUser.email})`,
        eq(employees.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(webUserRoles.role, 'SHIFT_MASTER'),
        eq(webUserRoles.scopeType, 'ORG_UNIT'),
        siteId ? eq(orgUnits.siteId, siteId) : undefined,
      ),
    );
  const masters = new Map<string, MonthMasterCandidate>();
  for (const row of masterRows) {
    if (!row.orgUnitId) continue;
    const key = `${row.orgUnitId}:${row.userId}`;
    const previous = masters.get(key);
    masters.set(key, {
      userId: row.userId,
      name: row.name,
      orgUnitId: row.orgUnitId,
      employeeIds: [
        ...new Set([...(previous?.employeeIds ?? []), ...(row.employeeId ? [row.employeeId] : [])]),
      ].sort(),
    });
  }
  return nominateMonth(
    staff.map((row) => ({ id: row.employeeId, name: row.name, points: row.points })),
    units,
    [...masters.values()],
  );
}

export function storedMonthNominations(
  row: typeof bonusMonthClosures.$inferSelect,
): MonthNominations {
  return MonthNominationsSnapshot.parse({
    employeeOfMonth: row.employeeId
      ? { id: row.employeeId, name: row.employeeName, points: row.employeePoints }
      : null,
    unitOfMonth: row.orgUnitId
      ? { id: row.orgUnitId, name: row.orgUnitName, points: row.orgUnitPoints }
      : null,
    masters: row.masters,
  });
}

/** A missing site is always a live aggregate, never a made-up global finalization. */
export async function readMonthNominations(tx: DbOrTx, siteId: string | null, month: string) {
  const [closed] = siteId
    ? await tx
        .select()
        .from(bonusMonthClosures)
        .where(and(eq(bonusMonthClosures.siteId, siteId), eq(bonusMonthClosures.month, month)))
        .limit(1)
    : [];
  const nominations = closed
    ? storedMonthNominations(closed)
    : await liveMonthNominations(tx, siteId, month);
  return {
    employeeOfMonth: nominations.employeeOfMonth,
    unitOfMonth: nominations.unitOfMonth,
    masterOfMonth: masterNominee(nominations),
    finalizedAt: closed?.closedAt.toISOString() ?? null,
  };
}
