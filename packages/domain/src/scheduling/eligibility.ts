import { reliefChecks, type PlannedBreak } from './breaks.js';
import {
  qualifiedFor,
  type QualificationHolding,
  type StaffingRequirementRule,
} from './coverage.js';

/**
 * One explainable evaluation of a proposed plan (SC-02, SC-05, SC-06, SC-17, SC-33, D-03).
 * Overlaps and required qualifications block; rest and monthly-hour limits follow the configured
 * severity; approved absences block and pending ones warn; availability preferences warn.
 * Pure: the caller supplies the proposed intervals, the context of the same people elsewhere,
 * absences, preferences, rules and staffing evidence.
 */

export type EligibilityCode =
  | 'OVERLAP'
  | 'REST'
  | 'MONTH_HOURS'
  | 'ABSENCE'
  | 'ABSENCE_PENDING'
  | 'UNAVAILABLE'
  | 'QUALIFICATION'
  | 'RELIEF';
export type EligibilitySeverity = 'BLOCK' | 'WARN';

export interface SchedulingRules {
  readonly minRestMinutes: number;
  readonly maxMonthMinutes: number;
  readonly restSeverity: EligibilitySeverity;
  readonly hoursSeverity: EligibilitySeverity;
}
/** Owner default (D-03): 11 h rest and 200 h per month, both warnings until configured. */
export const DEFAULT_SCHEDULING_RULES: SchedulingRules = {
  minRestMinutes: 11 * 60,
  maxMonthMinutes: 200 * 60,
  restSeverity: 'WARN',
  hoursSeverity: 'WARN',
};

export interface PlannedInterval {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly templateId?: string | undefined;
  readonly zoneId?: string | null | undefined;
  /** Where the interval lives; a different unit is reported in the reason. */
  readonly orgUnitId?: string | undefined;
  /** Planned breaks with their relief (SC-36); relief validity is part of the evaluation. */
  readonly breaks?: readonly PlannedBreak[] | undefined;
}

export interface AbsenceWindow {
  readonly employeeId: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly status: 'APPROVED' | 'PENDING';
}

export interface AvailabilityPreference {
  readonly employeeId: string;
  readonly kind: 'UNAVAILABLE' | 'PREFERRED';
  /** 0 = Sunday … 6 = Saturday; null when the preference names a date. */
  readonly weekday: number | null;
  readonly date: string | null;
  readonly validFrom: string;
  readonly validTo: string | null;
}

export interface EligibilityReason {
  readonly code: EligibilityCode;
  readonly severity: EligibilitySeverity;
  readonly employeeId: string;
  readonly businessDate: string;
  /** Minutes, hours, dates or unit ids that explain the reason; safe to display. */
  readonly detail: Readonly<Record<string, string | number>>;
}

export interface EvaluationInput {
  readonly proposed: readonly PlannedInterval[];
  /** Intervals of the same people outside the proposed plan (other units, other months). */
  readonly context: readonly PlannedInterval[];
  readonly absences: readonly AbsenceWindow[];
  readonly preferences: readonly AvailabilityPreference[];
  readonly rules: SchedulingRules;
  readonly staffing: {
    readonly requirements: readonly StaffingRequirementRule[];
    readonly holdings: readonly QualificationHolding[];
  };
  /** Month whose hours are totalled ('YYYY-MM'). */
  readonly month: string;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function key(item: PlannedInterval): string {
  return `${item.employeeId}:${item.businessDate}`;
}

/** Evaluates the complete proposed plan plus its context; two valid changes that conflict together fail. */
export function evaluatePlan(input: EvaluationInput): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];
  const seen = new Set<string>();
  const push = (reason: EligibilityReason) => {
    const id = `${reason.code}:${reason.employeeId}:${reason.businessDate}:${JSON.stringify(reason.detail)}`;
    if (seen.has(id)) return;
    seen.add(id);
    reasons.push(reason);
  };
  const byEmployee = new Map<string, { proposed: PlannedInterval[]; context: PlannedInterval[] }>();
  for (const item of input.proposed) {
    const entry = byEmployee.get(item.employeeId) ?? { proposed: [], context: [] };
    entry.proposed.push(item);
    byEmployee.set(item.employeeId, entry);
  }
  for (const item of input.context) {
    const entry = byEmployee.get(item.employeeId);
    if (entry) entry.context.push(item);
  }
  for (const [employeeId, entry] of byEmployee) {
    const all = [...entry.proposed, ...entry.context].sort((a, b) => a.startMs - b.startMs);
    const proposedKeys = new Set(entry.proposed.map(key));
    for (let index = 0; index < all.length; index += 1) {
      const current = all[index]!;
      for (let other = index + 1; other < all.length; other += 1) {
        const next = all[other]!;
        if (next.startMs >= current.endMs) break;
        const target = proposedKeys.has(key(current)) ? current : next;
        if (!proposedKeys.has(key(target))) continue;
        const counterpart = target === current ? next : current;
        push({
          code: 'OVERLAP',
          severity: 'BLOCK',
          employeeId,
          businessDate: target.businessDate,
          detail: {
            withDate: counterpart.businessDate,
            ...(counterpart.orgUnitId ? { orgUnitId: counterpart.orgUnitId } : {}),
          },
        });
      }
    }
    for (let index = 1; index < all.length; index += 1) {
      const previous = all[index - 1]!;
      const current = all[index]!;
      const gap = current.startMs - previous.endMs;
      if (gap < 0 || gap >= input.rules.minRestMinutes * 60_000) continue;
      const target = proposedKeys.has(key(current))
        ? current
        : proposedKeys.has(key(previous))
          ? previous
          : null;
      if (!target) continue;
      push({
        code: 'REST',
        severity: input.rules.restSeverity,
        employeeId,
        businessDate: target.businessDate,
        detail: {
          restMinutes: Math.round(gap / 60_000),
          minRestMinutes: input.rules.minRestMinutes,
          withDate: target === current ? previous.businessDate : current.businessDate,
        },
      });
    }
    const monthMinutes = all
      .filter((item) => item.businessDate.startsWith(input.month))
      .reduce((sum, item) => sum + (item.endMs - item.startMs) / 60_000, 0);
    if (monthMinutes > input.rules.maxMonthMinutes) {
      const last = [...entry.proposed]
        .filter((item) => item.businessDate.startsWith(input.month))
        .sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1))[0];
      if (last)
        push({
          code: 'MONTH_HOURS',
          severity: input.rules.hoursSeverity,
          employeeId,
          businessDate: last.businessDate,
          detail: {
            monthMinutes: Math.round(monthMinutes),
            maxMonthMinutes: input.rules.maxMonthMinutes,
            month: input.month,
          },
        });
    }
    for (const item of entry.proposed) {
      for (const absence of input.absences)
        if (
          absence.employeeId === employeeId &&
          absence.from <= item.businessDate &&
          item.businessDate <= absence.to
        )
          push({
            code: absence.status === 'APPROVED' ? 'ABSENCE' : 'ABSENCE_PENDING',
            severity: absence.status === 'APPROVED' ? 'BLOCK' : 'WARN',
            employeeId,
            businessDate: item.businessDate,
            detail: { type: absence.type, from: absence.from, to: absence.to },
          });
      for (const preference of input.preferences)
        if (
          preference.employeeId === employeeId &&
          preference.kind === 'UNAVAILABLE' &&
          preference.validFrom <= item.businessDate &&
          (preference.validTo === null || item.businessDate <= preference.validTo) &&
          ((preference.date !== null && preference.date === item.businessDate) ||
            (preference.date === null &&
              preference.weekday !== null &&
              preference.weekday === weekdayOf(item.businessDate)))
        )
          push({
            code: 'UNAVAILABLE',
            severity: 'WARN',
            employeeId,
            businessDate: item.businessDate,
            detail: preference.date
              ? { date: preference.date }
              : { weekday: preference.weekday ?? -1 },
          });
      if (
        item.templateId &&
        item.zoneId &&
        !qualifiedFor(input.staffing.requirements, input.staffing.holdings, {
          employeeId,
          businessDate: item.businessDate,
          templateId: item.templateId,
          zoneId: item.zoneId,
        })
      )
        push({
          code: 'QUALIFICATION',
          severity: 'BLOCK',
          employeeId,
          businessDate: item.businessDate,
          detail: { zoneId: item.zoneId },
        });
    }
  }
  // Relief for planned breaks (SC-36): a named relief must be planned, free and not doubled.
  for (const problem of reliefChecks(input.proposed, input.context))
    push({
      code: 'RELIEF',
      severity: 'BLOCK',
      employeeId: problem.employeeId,
      businessDate: problem.businessDate,
      detail: {
        position: problem.position,
        reliefEmployeeId: problem.reliefEmployeeId,
        problem: problem.problem,
      },
    });
  return reasons;
}

export type EligibilityStatus = 'ELIGIBLE' | 'WARNING' | 'BLOCKED';

export function eligibilityStatus(reasons: readonly EligibilityReason[]): EligibilityStatus {
  if (reasons.some((reason) => reason.severity === 'BLOCK')) return 'BLOCKED';
  return reasons.length > 0 ? 'WARNING' : 'ELIGIBLE';
}

/** Reasons that apply to one assignment of the evaluated plan. */
export function reasonsFor(
  reasons: readonly EligibilityReason[],
  employeeId: string,
  businessDate: string,
): EligibilityReason[] {
  return reasons.filter(
    (reason) => reason.employeeId === employeeId && reason.businessDate === businessDate,
  );
}
