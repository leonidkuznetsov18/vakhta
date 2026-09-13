import { useQuery } from '@tanstack/react-query';
import {
  evaluatePlan,
  planInstants,
  reasonsFor,
  type EligibilityReason,
  type PlannedInterval,
} from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import type {
  CandidatesQuery,
  PlanContextView,
  ShiftTemplateView,
  StaffingView,
} from '@vakhta/contracts';
import { currentLocale } from '@/i18n';
import { staffingApi } from '../api/staffing-api';
import { scheduleKeys } from './ownership';
import { gridToItems, type GridState } from './grid';

export const contextKey = (access: string, siteId: string, orgUnitId: string, month: string) =>
  [...scheduleKeys.all(access), 'context', siteId, orgUnitId, month] as const;
export const candidatesKey = (access: string, query: CandidatesQuery) =>
  [...scheduleKeys.all(access), 'candidates', query] as const;

/** Other plans, absences and membership for the loaded month; refreshed with the schedule. */
export function usePlanContext(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly month: string;
  readonly enabled: boolean;
}) {
  return useQuery({
    queryKey: contextKey(input.accessKey, input.siteId, input.orgUnitId, input.month),
    queryFn: ({ signal }) =>
      staffingApi.context(input.siteId, input.orgUnitId, input.month, signal),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId,
  });
}

export function useCandidates(accessKey: string, query: CandidatesQuery | null, enabled: boolean) {
  return useQuery({
    queryKey: candidatesKey(
      accessKey,
      query ?? { siteId: '', orgUnitId: '', zoneId: '', templateId: '', businessDate: '' },
    ),
    queryFn: ({ signal }) => {
      if (!query) throw new Error('Candidates query is not ready');
      return staffingApi.candidates(query, signal);
    },
    enabled: enabled && !!query,
  });
}

export interface PlanIssues {
  readonly reasons: readonly EligibilityReason[];
  readonly blocked: boolean;
  readonly ready: boolean;
}

/** Local evaluation of the plan on screen with the server context; the commit re-evaluates. */
export function planIssues(input: {
  readonly grid: GridState;
  readonly month: string;
  readonly orgUnitId: string;
  readonly templates: readonly ShiftTemplateView[];
  readonly timezone: string;
  readonly staffing: StaffingView | undefined;
  readonly context: PlanContextView | undefined;
}): PlanIssues {
  if (!input.staffing || !input.context) return { reasons: [], blocked: false, ready: false };
  const templates = new Map(input.templates.map((template) => [template.id, template]));
  const proposed: PlannedInterval[] = gridToItems(input.grid).flatMap((item) => {
    const template = templates.get(item.templateId);
    if (!template) return [];
    const plan = planInstants(item.businessDate, template, input.timezone);
    return [
      {
        employeeId: item.employeeId,
        businessDate: item.businessDate,
        startMs: plan.planStartAt.getTime(),
        endMs: plan.planEndAt.getTime(),
        templateId: item.templateId,
        zoneId: item.zoneId,
        orgUnitId: input.orgUnitId,
      },
    ];
  });
  const reasons = evaluatePlan({
    proposed,
    context: input.context.intervals.map((row) => ({
      employeeId: row.employeeId,
      businessDate: row.businessDate,
      startMs: Date.parse(row.startAt),
      endMs: Date.parse(row.endAt),
      orgUnitId: row.orgUnitId,
    })),
    absences: input.context.absences,
    preferences: input.staffing.availability,
    rules: input.staffing.rules,
    staffing: {
      requirements: input.staffing.requirements,
      holdings: input.staffing.holdings,
    },
    month: input.month,
  });
  return {
    reasons,
    blocked: reasons.some((reason) => reason.severity === 'BLOCK'),
    ready: true,
  };
}

export { reasonsFor };

/** Human text for one reason; numbers keep their units and dates stay explicit. */
export function reasonText(
  reason: EligibilityReason,
  labels: {
    readonly unitName?: (id: string) => string;
    readonly zoneName?: (id: string) => string;
  },
): string {
  const t = messages(currentLocale()).scheduleWorkspace;
  const detail = reason.detail;
  const hours = (minutes: unknown) =>
    typeof minutes === 'number' ? (Math.round((minutes / 60) * 10) / 10).toString() : '?';
  switch (reason.code) {
    case 'OVERLAP':
      return format(t.reasonOverlap, {
        date: String(detail['withDate'] ?? ''),
        unit:
          typeof detail['orgUnitId'] === 'string' && labels.unitName
            ? labels.unitName(detail['orgUnitId'])
            : t.reasonSameUnit,
      });
    case 'REST':
      return format(t.reasonRest, {
        rest: hours(detail['restMinutes']),
        min: hours(detail['minRestMinutes']),
        date: String(detail['withDate'] ?? ''),
      });
    case 'MONTH_HOURS':
      return format(t.reasonMonthHours, {
        hours: hours(detail['monthMinutes']),
        max: hours(detail['maxMonthMinutes']),
      });
    case 'ABSENCE':
      return format(t.reasonAbsence, {
        type: String(detail['type'] ?? ''),
        from: String(detail['from'] ?? ''),
        to: String(detail['to'] ?? ''),
      });
    case 'ABSENCE_PENDING':
      return format(t.reasonAbsencePending, {
        type: String(detail['type'] ?? ''),
        from: String(detail['from'] ?? ''),
        to: String(detail['to'] ?? ''),
      });
    case 'UNAVAILABLE':
      return t.reasonUnavailable;
    case 'QUALIFICATION':
      return format(t.reasonQualification, {
        zone:
          typeof detail['zoneId'] === 'string' && labels.zoneName
            ? labels.zoneName(detail['zoneId'])
            : '',
      });
  }
}
