import { planInstants } from '../time/plan.js';

/**
 * Planned breaks and relief (SC-36, D-04). A break is an ordered interval inside the planned shift;
 * a relief is another planned worker whose own interval contains the break. Planned breaks are a
 * planning statement only: actual break events keep their own owner and history.
 */

export interface BreakInput {
  readonly localStart: string;
  readonly localEnd: string;
  readonly reliefEmployeeId?: string | null | undefined;
}

export interface BreakInstants extends BreakInput {
  readonly position: number;
  readonly startAt: Date;
  readonly endAt: Date;
}

export type BreakError = 'BREAK_BOUNDS' | 'BREAK_EMPTY' | 'BREAK_OVERLAP';

/** Places break local times inside the planned interval, in order and without overlaps. */
export function resolveBreaks(
  interval: { readonly planStartAt: Date; readonly planEndAt: Date; readonly businessDate: string },
  breaks: readonly BreakInput[],
  timezone: string,
):
  { readonly breaks: BreakInstants[] } | { readonly error: BreakError; readonly position: number } {
  const resolved: BreakInstants[] = [];
  let cursor = interval.planStartAt.getTime();
  for (const [position, item] of breaks.entries()) {
    const sameDay = planInstants(
      interval.businessDate,
      { localStart: item.localStart, localEnd: item.localEnd },
      timezone,
    );
    let startAt = sameDay.planStartAt.getTime();
    let endAt = sameDay.planEndAt.getTime();
    if (startAt < interval.planStartAt.getTime()) {
      const shifted = planInstants(
        nextDate(interval.businessDate),
        { localStart: item.localStart, localEnd: item.localEnd },
        timezone,
      );
      startAt = shifted.planStartAt.getTime();
      endAt = shifted.planEndAt.getTime();
    }
    if (endAt <= startAt) return { error: 'BREAK_EMPTY', position };
    if (startAt < interval.planStartAt.getTime() || endAt > interval.planEndAt.getTime())
      return { error: 'BREAK_BOUNDS', position };
    if (startAt < cursor) return { error: 'BREAK_OVERLAP', position };
    resolved.push({ ...item, position, startAt: new Date(startAt), endAt: new Date(endAt) });
    cursor = endAt;
  }
  return { breaks: resolved };
}

export interface PlannedBreak {
  readonly startMs: number;
  readonly endMs: number;
  readonly reliefEmployeeId?: string | null | undefined;
}

export interface BreakOwner {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly breaks?: readonly PlannedBreak[] | undefined;
}

export type ReliefProblem = 'RELIEF_SELF' | 'RELIEF_ABSENT' | 'RELIEF_BUSY';

export interface ReliefCheck {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly position: number;
  readonly reliefEmployeeId: string;
  readonly problem: ReliefProblem;
}

function overlaps(a: PlannedBreak, b: PlannedBreak): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Whether every named relief is valid: a relief must be another worker planned over the whole
 * break, not on a break of their own at that time, and not relieving a second break at the same
 * time. One person never covers two simultaneous posts.
 */
export function reliefChecks(
  owners: readonly BreakOwner[],
  context: readonly BreakOwner[] = [],
): ReliefCheck[] {
  const problems: ReliefCheck[] = [];
  const all = [...owners, ...context];
  const reliefs = owners.flatMap((owner) =>
    (owner.breaks ?? []).flatMap((item, position) =>
      item.reliefEmployeeId
        ? [{ owner, position, item, reliefEmployeeId: item.reliefEmployeeId }]
        : [],
    ),
  );
  for (const relief of reliefs) {
    const report = (problem: ReliefProblem) =>
      problems.push({
        employeeId: relief.owner.employeeId,
        businessDate: relief.owner.businessDate,
        position: relief.position,
        reliefEmployeeId: relief.reliefEmployeeId,
        problem,
      });
    if (relief.reliefEmployeeId === relief.owner.employeeId) {
      report('RELIEF_SELF');
      continue;
    }
    const own = all.filter((item) => item.employeeId === relief.reliefEmployeeId);
    const planned = own.find(
      (item) => item.startMs <= relief.item.startMs && item.endMs >= relief.item.endMs,
    );
    if (!planned) {
      report('RELIEF_ABSENT');
      continue;
    }
    const onOwnBreak = own.some((item) =>
      (item.breaks ?? []).some((other) => overlaps(other, relief.item)),
    );
    const doubleRelief = reliefs.some(
      (other) =>
        other !== relief &&
        other.reliefEmployeeId === relief.reliefEmployeeId &&
        overlaps(other.item, relief.item),
    );
    if (onOwnBreak || doubleRelief) report('RELIEF_BUSY');
  }
  return problems;
}

/** A break is covered when its relief exists and passes every relief check. */
export function coveredBreaks(
  owner: BreakOwner,
  owners: readonly BreakOwner[],
  context: readonly BreakOwner[] = [],
): boolean[] {
  const problems = reliefChecks(owners, context).filter(
    (problem) =>
      problem.employeeId === owner.employeeId && problem.businessDate === owner.businessDate,
  );
  return (owner.breaks ?? []).map(
    (item, position) =>
      !!item.reliefEmployeeId && !problems.some((problem) => problem.position === position),
  );
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
