import {
  and,
  assignmentAcknowledgements,
  desc,
  employeeAvailability,
  employeePositions,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  orgUnits,
  presenceSessions,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  siteSchedulingRules,
  sql,
  type DbOrTx,
  employees,
  wellbeingCheckins,
} from '@vakhta/db';
import {
  PresenceState,
  type AbsenceEventView,
  type AssignmentPresenceView,
  type OperationalRequestView,
  type ReplacementNeedView,
} from '@vakhta/contracts';
import { routeFor, TERMINAL_STATES } from '@vakhta/domain';
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

interface AbsenceRange {
  readonly employeeIds?: readonly string[];
  readonly from: string;
  readonly to: string;
}

/** Shared selection only: callers retain their distinct rule and calendar projections. */
function absencesInRange(input: AbsenceRange) {
  return and(
    inArray(requests.type, [...ABSENCE_TYPES]),
    inArray(requests.status, ['APPROVED', 'SUBMITTED', 'IN_REVIEW']),
    lte(requests.periodFrom, input.to),
    gte(requests.periodTo, input.from),
    ...(input.employeeIds ? [inArray(requests.employeeId, [...input.employeeIds])] : []),
  );
}

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
export async function loadAbsences(tx: DbOrTx, input: AbsenceRange): Promise<AbsenceWindow[]> {
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
    .where(absencesInRange(input));
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

/**
 * Presence evidence of the unit's published assignments in a date range (SC-07): acknowledged,
 * arrived (presence session), started/closed (shift session) or, after the planned start, no
 * evidence at all. A failed read or a missing QR scan is never turned into a no-show here.
 */
export async function loadPresence(
  tx: DbOrTx,
  input: {
    readonly siteId: string;
    readonly orgUnitId: string;
    readonly from: string;
    readonly to: string;
  },
  now: Date = new Date(),
): Promise<AssignmentPresenceView[]> {
  const rows = await tx
    .select({
      id: shiftAssignments.id,
      employeeId: shiftAssignments.employeeId,
      businessDate: shiftAssignments.businessDate,
      planStartAt: shiftAssignments.planStartAt,
      acknowledgedAt: assignmentAcknowledgements.acknowledgedAt,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .leftJoin(
      assignmentAcknowledgements,
      eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
    )
    .where(
      and(
        eq(scheduleVersions.siteId, input.siteId),
        eq(scheduleVersions.orgUnitId, input.orgUnitId),
        eq(scheduleVersions.status, 'PUBLISHED'),
        eq(shiftAssignments.status, 'PLANNED'),
        gte(shiftAssignments.businessDate, input.from),
        lte(shiftAssignments.businessDate, input.to),
      ),
    );
  if (rows.length === 0) return [];
  const slots = {
    orgUnitId: input.orgUnitId,
    employeeIds: [...new Set(rows.map((row) => row.employeeId))],
    from: input.from,
    to: input.to,
  };
  const arrivals = latestBySlot(
    await tx
      .select({
        employeeId: shiftAssignments.employeeId,
        businessDate: shiftAssignments.businessDate,
        arrivedAt: presenceSessions.arrivedAt,
      })
      .from(presenceSessions)
      .innerJoin(shiftAssignments, eq(shiftAssignments.id, presenceSessions.assignmentId))
      .where(sameSlotAssignments(slots))
      .orderBy(desc(presenceSessions.arrivedAt)),
  );
  const sessions = latestBySlot(
    await tx
      .select({
        employeeId: shiftAssignments.employeeId,
        businessDate: shiftAssignments.businessDate,
        id: shiftSessions.id,
        state: shiftSessions.state,
        startedAt: shiftSessions.startedAt,
        endedAt: shiftSessions.endedAt,
      })
      .from(shiftSessions)
      .innerJoin(shiftAssignments, eq(shiftAssignments.id, shiftSessions.assignmentId))
      .where(sameSlotAssignments(slots))
      .orderBy(desc(shiftSessions.createdAt)),
  );
  return rows.map((row) => {
    const key = planSlotKey(row);
    const arrival = arrivals.get(key);
    const session = sessions.get(key);
    return {
      assignmentId: row.id,
      employeeId: row.employeeId,
      businessDate: row.businessDate,
      state: presenceState(row, arrival, session, now),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      arrivedAt: arrival?.arrivedAt.toISOString() ?? null,
      startedAt: session?.startedAt?.toISOString() ?? null,
      endedAt: session?.endedAt?.toISOString() ?? null,
      sessionState: session?.state ?? null,
      sessionId: session?.id ?? null,
    };
  });
}

/**
 * A plan slot is one employee on one business date in one unit: each version holds at most one
 * assignment for it. Republishing gives the slot a new assignment id, while shifts and arrivals
 * keep the id of the version current when they were recorded, so evidence is matched by slot.
 */
interface PlanSlot {
  readonly employeeId: string;
  readonly businessDate: string;
}

export function planSlotKey(slot: PlanSlot): string {
  return `${slot.employeeId}|${slot.businessDate}`;
}

/** Assignments of any version (published, superseded) for the unit's slots in the range. */
export function sameSlotAssignments(input: {
  readonly orgUnitId: string;
  readonly employeeIds: readonly string[];
  readonly from: string;
  readonly to: string;
}) {
  return and(
    eq(shiftAssignments.orgUnitId, input.orgUnitId),
    inArray(shiftAssignments.employeeId, [...input.employeeIds]),
    gte(shiftAssignments.businessDate, input.from),
    lte(shiftAssignments.businessDate, input.to),
  );
}

/** Rows must arrive newest first; the first row per slot wins. */
export function latestBySlot<T extends PlanSlot>(rows: readonly T[]): Map<string, T> {
  const bySlot = new Map<string, T>();
  for (const row of rows) {
    const key = planSlotKey(row);
    if (!bySlot.has(key)) bySlot.set(key, row);
  }
  return bySlot;
}

const TERMINAL = new Set<string>(TERMINAL_STATES);

function presenceState(
  plan: { readonly planStartAt: Date; readonly acknowledgedAt: Date | null },
  arrival: { readonly arrivedAt: Date } | undefined,
  session:
    | { readonly state: string; readonly startedAt: Date | null; readonly endedAt: Date | null }
    | undefined,
  now: Date,
): PresenceState {
  if (session?.startedAt) {
    const closed = TERMINAL.has(session.state) || session.endedAt !== null;
    return closed ? PresenceState.enum.CLOSED : PresenceState.enum.STARTED;
  }
  if (arrival) return PresenceState.enum.ARRIVED;
  if (plan.planStartAt.getTime() <= now.getTime()) return PresenceState.enum.NO_EVIDENCE;
  if (plan.acknowledgedAt) return PresenceState.enum.ACKNOWLEDGED;
  return PresenceState.enum.SCHEDULED;
}

/**
 * Open and decided requests of the unit's planned people that touch the range (SC-13/14/34):
 * enough to show the workflow and its current step; decisions stay in the Requests workflow.
 */
export async function loadOperationalRequests(
  tx: DbOrTx,
  input: {
    readonly siteId: string;
    readonly orgUnitId: string;
    readonly from: string;
    readonly to: string;
  },
): Promise<OperationalRequestView[]> {
  const people = await tx
    .select({ employeeId: shiftAssignments.employeeId })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .where(
      and(
        eq(scheduleVersions.siteId, input.siteId),
        eq(scheduleVersions.orgUnitId, input.orgUnitId),
        inArray(scheduleVersions.status, ['DRAFT', 'IN_REVIEW', 'PUBLISHED']),
        eq(shiftAssignments.status, 'PLANNED'),
      ),
    );
  const employeeIds = [...new Set(people.map((row) => row.employeeId))];
  if (employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      id: requests.id,
      type: requests.type,
      status: requests.status,
      employeeId: requests.employeeId,
      counterpartEmployeeId: requests.counterpartEmployeeId,
      periodFrom: requests.periodFrom,
      periodTo: requests.periodTo,
      assignmentId: requests.assignmentId,
      assignmentDate: shiftAssignments.businessDate,
      currentStep: requests.currentStep,
      submittedAt: requests.submittedAt,
    })
    .from(requests)
    .leftJoin(shiftAssignments, eq(shiftAssignments.id, requests.assignmentId))
    .where(
      and(
        or(
          inArray(requests.employeeId, employeeIds),
          inArray(requests.counterpartEmployeeId, employeeIds),
        ),
        inArray(requests.status, ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']),
        or(
          and(lte(requests.periodFrom, input.to), gte(requests.periodTo, input.from)),
          and(
            gte(shiftAssignments.businessDate, input.from),
            lte(shiftAssignments.businessDate, input.to),
          ),
        ),
      ),
    )
    .orderBy(desc(requests.submittedAt));
  return rows.map((row) => {
    const steps = routeFor(row.type);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      employeeId: row.employeeId,
      counterpartEmployeeId: row.counterpartEmployeeId,
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      assignmentId: row.assignmentId,
      assignmentDate: row.assignmentDate,
      currentStep: row.currentStep,
      currentStepKey: steps[row.currentStep]?.key ?? null,
      totalSteps: Math.max(1, steps.length),
      submittedAt: row.submittedAt.toISOString(),
    };
  });
}

/** Approved and pending absence requests touching the range, with the latest sick-leave answer. */
export async function loadAbsenceEvents(
  tx: DbOrTx,
  input: AbsenceRange,
): Promise<AbsenceEventView[]> {
  if (input.employeeIds && input.employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      id: requests.id,
      employeeId: requests.employeeId,
      from: requests.periodFrom,
      to: requests.periodTo,
      type: requests.type,
      status: requests.status,
    })
    .from(requests)
    .where(absencesInRange(input));
  const ids = rows.map((row) => row.id);
  const checkins =
    ids.length > 0
      ? await tx
          .select()
          .from(wellbeingCheckins)
          .where(inArray(wellbeingCheckins.requestId, ids))
          .orderBy(desc(wellbeingCheckins.businessDate))
      : [];
  return rows.flatMap((row) => {
    if (!row.from || !row.to) return [];
    const last = checkins.find((item) => item.requestId === row.id);
    return [
      {
        requestId: row.id,
        employeeId: row.employeeId,
        type: row.type,
        status: row.status === 'APPROVED' ? ('APPROVED' as const) : ('PENDING' as const),
        from: row.from,
        to: row.to,
        lastCheckin: last
          ? {
              businessDate: last.businessDate,
              answer: last.answer,
              answeredAt: last.answeredAt.toISOString(),
            }
          : null,
      },
    ];
  });
}

/** Planned shifts of published plans whose person is on an approved absence that day. */
export async function loadReplacementNeeds(
  tx: DbOrTx,
  input: {
    readonly siteId: string;
    readonly orgUnitId?: string;
    readonly from: string;
    readonly to: string;
  },
): Promise<ReplacementNeedView[]> {
  const planned = await tx
    .select({
      id: shiftAssignments.id,
      employeeId: shiftAssignments.employeeId,
      businessDate: shiftAssignments.businessDate,
      zoneId: shiftAssignments.zoneId,
      orgUnitId: shiftAssignments.orgUnitId,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .where(
      and(
        eq(scheduleVersions.siteId, input.siteId),
        ...(input.orgUnitId ? [eq(scheduleVersions.orgUnitId, input.orgUnitId)] : []),
        eq(scheduleVersions.status, 'PUBLISHED'),
        eq(shiftAssignments.status, 'PLANNED'),
        gte(shiftAssignments.businessDate, input.from),
        lte(shiftAssignments.businessDate, input.to),
      ),
    );
  if (planned.length === 0) return [];
  const absences = (
    await loadAbsenceEvents(tx, {
      employeeIds: [...new Set(planned.map((row) => row.employeeId))],
      from: input.from,
      to: input.to,
    })
  ).filter((absence) => absence.status === 'APPROVED');
  return planned.flatMap((row) => {
    const absence = absences.find(
      (item) =>
        item.employeeId === row.employeeId &&
        item.from <= row.businessDate &&
        row.businessDate <= item.to,
    );
    return absence
      ? [
          {
            assignmentId: row.id,
            employeeId: row.employeeId,
            businessDate: row.businessDate,
            zoneId: row.zoneId,
            orgUnitId: row.orgUnitId,
            requestId: absence.requestId,
            type: absence.type,
          },
        ]
      : [];
  });
}

/** Birthdays of the given people that fall inside the range (year-agnostic month-day match). */
export async function loadBirthdays(
  tx: DbOrTx,
  input: { readonly employeeIds: readonly string[]; readonly from: string; readonly to: string },
): Promise<{ employeeId: string; date: string }[]> {
  if (input.employeeIds.length === 0) return [];
  const rows = await tx
    .select({ id: employees.id, birthDate: employees.birthDate })
    .from(employees)
    .where(and(inArray(employees.id, [...input.employeeIds]), eq(employees.status, 'ACTIVE')));
  const first = Number(input.from.slice(0, 4));
  const last = Number(input.to.slice(0, 4));
  const result: { employeeId: string; date: string }[] = [];
  for (const row of rows) {
    if (!row.birthDate) continue;
    for (let year = first; year <= last; year += 1) {
      const candidate = new Date(`${year}-${row.birthDate.slice(5)}T00:00:00Z`);
      const date = Number.isNaN(candidate.getTime())
        ? `${year}-03-01`
        : candidate.toISOString().slice(0, 10);
      if (date >= input.from && date <= input.to) result.push({ employeeId: row.id, date });
    }
  }
  return result;
}
