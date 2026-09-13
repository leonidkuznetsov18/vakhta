import type { OpenSlotView, ShiftTemplateView } from '@vakhta/contracts';
import {
  assignmentInstants,
  proposeAllocation,
  reasonsFor,
  type ProposalPreferences,
  type ProposalResult,
} from '@vakhta/domain';
import { gridToItems, setAssignment, type GridState } from './grid';
import { planIssues } from './use-eligibility';
import { workloadModel } from './workload';
import type { Workspace } from './use-workspace';

/**
 * Local allocation proposal (SC-45): open slots of the month, an explicit cohort, and the same
 * rule evaluation as the editor, applied to the whole plan as picks accumulate. Pure computation
 * over the loaded workspace; nothing here writes or publishes.
 */
export function proposalModel(input: {
  readonly workspace: Pick<
    Workspace,
    'grid' | 'templates' | 'timezone' | 'month' | 'orgUnitId' | 'staffing' | 'context' | 'employees'
  >;
  readonly slots: readonly OpenSlotView[];
  readonly cohort: 'unit' | 'site';
  readonly preferences: ProposalPreferences;
}): ProposalResult & { readonly ready: boolean } {
  const w = input.workspace;
  const templates = new Map(w.templates.map((template) => [template.id, template]));
  const open = input.slots.filter((slot) => slot.status === 'OPEN' || slot.status === 'OFFERED');
  const slots = open.flatMap((slot) => {
    const template: ShiftTemplateView | undefined = templates.get(slot.templateId);
    if (!template) return [];
    const plan = assignmentInstants({ businessDate: slot.businessDate, template }, w.timezone);
    return [
      {
        slotId: slot.id,
        businessDate: slot.businessDate,
        templateId: slot.templateId,
        zoneId: slot.zoneId,
        startMs: plan.planStartAt.getTime(),
        endMs: plan.planEndAt.getTime(),
      },
    ];
  });
  const otherUnit = new Set((w.context?.otherUnitEmployees ?? []).map((row) => row.employeeId));
  const planned = new Set(w.grid.rows.map((row) => row.employeeId));
  const people = w.employees
    .filter((employee) => employee.status === 'ACTIVE')
    .filter((employee) =>
      input.cohort === 'site' ? true : planned.has(employee.id) || !otherUnit.has(employee.id),
    )
    .map((employee) => ({ employeeId: employee.id, ownUnit: !otherUnit.has(employee.id) }));
  const load = workloadModel({
    grid: w.grid,
    templates: w.templates,
    timezone: w.timezone,
    dates: [...new Set(gridToItems(w.grid).map((item) => item.businessDate))],
  });
  const minutes = new Map(load.rows.map((row) => [row.employeeId, row.plannedMinutes]));
  const ready = !!w.staffing && !!w.context;
  const result = proposeAllocation({
    slots,
    people: people.map((person) => ({
      ...person,
      plannedMinutes: minutes.get(person.employeeId) ?? 0,
    })),
    preferences: input.preferences,
    evaluate: (employeeId, slot, picks) => {
      let grid: GridState = w.grid;
      for (const pick of picks) {
        const picked = slots.find((item) => item.slotId === pick.slotId);
        if (!picked) continue;
        grid = setAssignment(grid, {
          employeeId: pick.employeeId,
          businessDate: picked.businessDate,
          templateId: picked.templateId,
          zoneId: picked.zoneId,
          kind: 'REGULAR',
        });
      }
      const occupied = gridToItems(grid).some(
        (item) => item.employeeId === employeeId && item.businessDate === slot.businessDate,
      );
      if (occupied) return { blocked: true, reasons: [] };
      const candidate = setAssignment(grid, {
        employeeId,
        businessDate: slot.businessDate,
        templateId: slot.templateId,
        zoneId: slot.zoneId,
        kind: 'REGULAR',
      });
      const issues = planIssues({
        grid: candidate,
        month: w.month,
        orgUnitId: w.orgUnitId,
        templates: w.templates,
        timezone: w.timezone,
        staffing: w.staffing,
        context: w.context,
      });
      const reasons = reasonsFor(issues.reasons, employeeId, slot.businessDate);
      return { blocked: reasons.some((reason) => reason.severity === 'BLOCK'), reasons };
    },
  });
  return { ...result, ready };
}
