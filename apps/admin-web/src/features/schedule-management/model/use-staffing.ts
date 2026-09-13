import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coverage, planInstants, zoneHasRequirement, type CoverageCell } from '@vakhta/domain';
import type {
  CreateQualificationCommand,
  RecordEmployeeQualificationCommand,
  SetStaffingRequirementCommand,
  ShiftTemplateView,
  StaffingView,
} from '@vakhta/contracts';
import { staffingApi } from '../api/staffing-api';
import { scheduleKeys } from './ownership';
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
  return {
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
      removeHolding.isPending,
  };
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
  const rules = input.staffing.requirements;
  const assignments = gridToItems(input.grid)
    .filter((item) => input.dates.includes(item.businessDate))
    .map((item) => {
      const plan = interval(item.zoneId ?? '', item.templateId, item.businessDate);
      return {
        employeeId: item.employeeId,
        businessDate: item.businessDate,
        templateId: item.templateId,
        zoneId: item.zoneId,
        ...(plan ? { startMs: plan.startMs, endMs: plan.endMs } : {}),
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
