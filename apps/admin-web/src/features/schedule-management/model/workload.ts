import type { AssignmentInput, ShiftTemplateView } from '@vakhta/contracts';
import { assignmentInstants, workload, type WorkloadSummary } from '@vakhta/domain';
import { gridToItems, type GridState } from './grid';
import { breakMinutes } from './breaks';

/**
 * Planned workload of the people on the plan over the given dates (SC-35). The cohort is every
 * worker with at least one assignment in the loaded plan, so the comparison names who is compared.
 */
export function workloadModel(input: {
  readonly grid: GridState;
  readonly templates: readonly ShiftTemplateView[];
  readonly timezone: string;
  readonly dates: readonly string[];
}): WorkloadSummary {
  const templates = new Map(input.templates.map((template) => [template.id, template]));
  const items: AssignmentInput[] = gridToItems(input.grid);
  const assignments = items.flatMap((item) => {
    const template = templates.get(item.templateId);
    if (!template) return [];
    const plan = assignmentInstants({ ...item, template }, input.timezone);
    return [
      {
        employeeId: item.employeeId,
        businessDate: item.businessDate,
        startMs: plan.planStartAt.getTime(),
        endMs: plan.planEndAt.getTime(),
        isNight: template.isNight,
        breakMinutes: breakMinutes(item, template, input.timezone),
      },
    ];
  });
  return workload({
    assignments,
    dates: input.dates,
    cohort: input.grid.rows.map((row) => row.employeeId),
  });
}
