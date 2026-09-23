import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignmentInstants,
  coverage,
  planInstants,
  templateLineage,
  zoneHasRequirement,
  type CoverageCell,
} from '@vakhta/domain';
import type {
  CreateQualificationCommand,
  RecordAvailabilityCommand,
  RecordEmployeeQualificationCommand,
  SetSchedulingRulesCommand,
  SetStaffingRequirementCommand,
  ShiftTemplateView,
  StaffingView,
} from '@vakhta/contracts';
import { staffingApi } from '../api/staffing-api';
import { scheduleKeys } from './ownership';
import { plannedBreaks } from './breaks';
import { gridToItems, type GridState } from './grid';

export const staffingKey = (access: string, siteId: string, orgUnitId: string) =>
  [...scheduleKeys.all(access), 'staffing', siteId, orgUnitId] as const;

/** Requirements, catalog and holdings of the unit; edits invalidate the same key. */
export function useStaffing(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly enabled: boolean;
}) {
  const client = useQueryClient();
  const key = staffingKey(input.accessKey, input.siteId, input.orgUnitId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => staffingApi.view(input.siteId, input.orgUnitId, signal),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const options = { retry: false, networkMode: 'always' as const, onSuccess: refresh };
  const setRequirement = useMutation({
    mutationFn: (command: SetStaffingRequirementCommand) => staffingApi.setRequirement(command),
    ...options,
  });
  const removeRequirement = useMutation({
    mutationFn: (id: string) => staffingApi.removeRequirement(id),
    ...options,
  });
  const createQualification = useMutation({
    mutationFn: (command: CreateQualificationCommand) => staffingApi.createQualification(command),
    ...options,
  });
  const recordHolding = useMutation({
    mutationFn: (command: RecordEmployeeQualificationCommand) => staffingApi.recordHolding(command),
    ...options,
  });
  const removeHolding = useMutation({
    mutationFn: (id: string) => staffingApi.removeHolding(id),
    ...options,
  });
  const setRules = useMutation({
    mutationFn: (command: SetSchedulingRulesCommand) => staffingApi.setRules(command),
    ...options,
  });
  const recordAvailability = useMutation({
    mutationFn: (command: RecordAvailabilityCommand) => staffingApi.recordAvailability(command),
    ...options,
  });
  const removeAvailability = useMutation({
    mutationFn: (id: string) => staffingApi.removeAvailability(id),
    ...options,
  });
  return {
    setRules,
    recordAvailability,
    removeAvailability,
    query,
    data: query.data,
    setRequirement,
    removeRequirement,
    createQualification,
    recordHolding,
    removeHolding,
    busy:
      setRequirement.isPending ||
      removeRequirement.isPending ||
      createQualification.isPending ||
      recordHolding.isPending ||
      removeHolding.isPending ||
      setRules.isPending ||
      recordAvailability.isPending ||
      removeAvailability.isPending,
  };
}

/**
 * Staffing demand keyed by the current version of each shift: an hours edit hands a used shift to
 * its successor (ADR-0017), and plans on either version count against the same demand.
 */
export function currentDemand(
  requirements: StaffingView['requirements'],
  lineage: (templateId: string) => string,
): StaffingView['requirements'] {
  return requirements.map((row) => ({ ...row, templateId: lineage(row.templateId) }));
}

export interface CoverageModel {
  readonly cells: readonly CoverageCell[];
  /** Zones with at least one requirement in force on the visible dates. */
  readonly known: ReadonlySet<string>;
  readonly ready: boolean;
}

/** Coverage of the plan on screen, including unsaved edits; unknown when staffing is unavailable. */
export function staffingCoverage(input: {
  readonly staffing: StaffingView | undefined;
  readonly grid: GridState;
  readonly templates: readonly ShiftTemplateView[];
  readonly timezone: string;
  readonly dates: readonly string[];
  readonly zoneIds: readonly string[];
}): CoverageModel {
  if (!input.staffing) return { cells: [], known: new Set(), ready: false };
  const templates = new Map(input.templates.map((template) => [template.id, template]));
  const interval = (zoneId: string, templateId: string, businessDate: string) => {
    const template = templates.get(templateId);
    if (!template) return null;
    const plan = planInstants(businessDate, template, input.timezone);
    return {
      zoneId,
      templateId,
      businessDate,
      startMs: plan.planStartAt.getTime(),
      endMs: plan.planEndAt.getTime(),
    };
  };
  const lineage = templateLineage(input.templates);
  const rules = currentDemand(input.staffing.requirements, lineage);
  const assignments = gridToItems(input.grid)
    .filter((item) => input.dates.includes(item.businessDate))
    .map((item) => {
      const template = templates.get(item.templateId);
      const plan = template ? assignmentInstants({ ...item, template }, input.timezone) : null;
      return {
        employeeId: item.employeeId,
        businessDate: item.businessDate,
        templateId: lineage(item.templateId),
        zoneId: item.zoneId,
        ...(plan ? { startMs: plan.planStartAt.getTime(), endMs: plan.planEndAt.getTime() } : {}),
        breaks: plannedBreaks(item, template, input.timezone),
      };
    });
  return {
    cells: coverage({
      rules,
      holdings: input.staffing.holdings,
      assignments,
      dates: input.dates,
      zoneIds: input.zoneIds,
      interval,
    }),
    known: new Set(
      input.zoneIds.filter((zoneId) => zoneHasRequirement(rules, zoneId, input.dates)),
    ),
    ready: true,
  };
}
