import {
  and,
  employeeAvailability,
  employeePositions,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  orgUnits,
  requests,
  scheduleVersions,
  shiftAssignments,
  siteSchedulingRules,
  sql,
  type DbOrTx,
} from '@vakhta/db';
import {
  DEFAULT_SCHEDULING_RULES,
  type AbsenceWindow,
  type AvailabilityPreference,
  type PlannedInterval,
  type SchedulingRules,
} from '@vakhta/domain';

/**
 * Context for plan evaluation (SC-05/06/17/33): the same people's planned intervals in other
 * units and months, their absence requests, availability preferences and the site's rules.
 * Reads only; the writer that evaluates a plan holds its own locks.
 */

const ABSENCE_TYPES = ['VACATION', 'SICK', 'DAY_OFF'] as const;

export interface ContextRow {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly orgUnitId: string;
  readonly periodMonth: string;
  readonly status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED';
}

/**
 * Planned intervals of the given people between two business dates, one working plan per unit
 * and month (published first, then reviewed, then draft), excluding the plan being replaced.
 */
export async function loadContextIntervals(
  tx: DbOrTx,
  input: {
    readonly siteId: string;
    readonly employeeIds?: readonly string[];
    readonly from: string;
    readonly to: string;
    readonly exclude?: { readonly orgUnitId: string; readonly periodMonth: string };
  },
): Promise<ContextRow[]> {
  if (input.employeeIds && input.employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      employeeId: shiftAssignments.employeeId,
      businessDate: shiftAssignments.businessDate,
      startAt: shiftAssignments.planStartAt,
      endAt: shiftAssignments.planEndAt,
      orgUnitId: scheduleVersions.orgUnitId,
      periodMonth: scheduleVersions.periodMonth,
      status: scheduleVersions.status,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .where(
      and(
        eq(scheduleVersions.siteId, input.siteId),
        inArray(scheduleVersions.status, ['DRAFT', 'IN_REVIEW', 'PUBLISHED']),
        eq(shiftAssignments.status, 'PLANNED'),
        gte(shiftAssignments.businessDate, input.from),
        lte(shiftAssignments.businessDate, input.to),
        ...(input.employeeIds
          ? [inArray(shiftAssignments.employeeId, [...input.employeeIds])]
          : []),
      ),
    );
  const rank = { PUBLISHED: 0, IN_REVIEW: 1, DRAFT: 2 } as const;
  const best = new Map<string, 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED'>();
  for (const row of rows) {
    if (row.status === 'SUPERSEDED' || row.status === 'CLOSED') continue;
    const key = `${row.orgUnitId}:${row.periodMonth}`;
    const current = best.get(key);
    if (!current || rank[row.status] < rank[current]) best.set(key, row.status);
  }
  return rows.flatMap((row) => {
    if (row.status === 'SUPERSEDED' || row.status === 'CLOSED') return [];
    if (
      input.exclude &&
      row.orgUnitId === input.exclude.orgUnitId &&
      row.periodMonth === input.exclude.periodMonth
    )
      return [];
    if (best.get(`${row.orgUnitId}:${row.periodMonth}`) !== row.status) return [];
    return [{ ...row, status: row.status }];
  });
}

export function toPlannedIntervals(rows: readonly ContextRow[]): PlannedInterval[] {
  return rows.map((row) => ({
    employeeId: row.employeeId,
    businessDate: row.businessDate,
    startMs: row.startAt.getTime(),
    endMs: row.endAt.getTime(),
    orgUnitId: row.orgUnitId,
  }));
}

/** Approved absences block, submitted or reviewed ones warn (SC-03 states stay distinct). */
export async function loadAbsences(
  tx: DbOrTx,
  input: { readonly employeeIds?: readonly string[]; readonly from: string; readonly to: string },
): Promise<AbsenceWindow[]> {
  if (input.employeeIds && input.employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      employeeId: requests.employeeId,
      from: requests.periodFrom,
      to: requests.periodTo,
      type: requests.type,
      status: requests.status,
    })
    .from(requests)
    .where(
      and(
        inArray(requests.type, [...ABSENCE_TYPES]),
        inArray(requests.status, ['APPROVED', 'SUBMITTED', 'IN_REVIEW']),
        lte(requests.periodFrom, input.to),
        gte(requests.periodTo, input.from),
        ...(input.employeeIds ? [inArray(requests.employeeId, [...input.employeeIds])] : []),
      ),
    );
  return rows.flatMap((row) =>
    row.from && row.to
      ? [
          {
            employeeId: row.employeeId,
            from: row.from,
            to: row.to,
            type: row.type,
            status: row.status === 'APPROVED' ? ('APPROVED' as const) : ('PENDING' as const),
          },
        ]
      : [],
  );
}

export async function loadPreferences(
  tx: DbOrTx,
  employeeIds?: readonly string[],
): Promise<AvailabilityPreference[]> {
  if (employeeIds && employeeIds.length === 0) return [];
  const rows = await tx
    .select()
    .from(employeeAvailability)
    .where(employeeIds ? inArray(employeeAvailability.employeeId, [...employeeIds]) : sql`true`);
  return rows.map((row) => ({
    employeeId: row.employeeId,
    kind: row.kind,
    weekday: row.weekday,
    date: row.date,
    validFrom: row.validFrom,
    validTo: row.validTo,
  }));
}

export async function loadRules(
  tx: DbOrTx,
  siteId: string,
): Promise<SchedulingRules & { configured: boolean }> {
  const [row] = await tx
    .select()
    .from(siteSchedulingRules)
    .where(eq(siteSchedulingRules.siteId, siteId));
  return row
    ? {
        minRestMinutes: row.minRestMinutes,
        maxMonthMinutes: row.maxMonthMinutes,
        restSeverity: row.restSeverity,
        hoursSeverity: row.hoursSeverity,
        configured: true,
      }
    : { ...DEFAULT_SCHEDULING_RULES, configured: false };
}

/** Current unit of every employee with an open position in the site. */
export async function loadUnitMembership(
  tx: DbOrTx,
  siteId: string,
): Promise<{ employeeId: string; orgUnitId: string }[]> {
  return tx
    .select({ employeeId: employeePositions.employeeId, orgUnitId: employeePositions.orgUnitId })
    .from(employeePositions)
    .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
    .where(and(eq(orgUnits.siteId, siteId), isNull(employeePositions.validTo)));
}

/** One business date before and after the month, so overnight rest across the boundary is visible. */
export function monthContextRange(periodMonth: string): { from: string; to: string } {
  const start = new Date(`${periodMonth}-01T00:00:00Z`);
  const before = new Date(start);
  before.setUTCDate(before.getUTCDate() - 1);
  const after = new Date(start);
  after.setUTCMonth(after.getUTCMonth() + 1);
  return { from: before.toISOString().slice(0, 10), to: after.toISOString().slice(0, 10) };
}
