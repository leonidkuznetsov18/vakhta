import type { AssignmentInput } from '@vakhta/contracts';

/** Compare the complete assignment, excluding version and generated row identifiers. */
export function assignmentContent(
  item: AssignmentInput,
  plan: { planStartAt: Date; planEndAt: Date },
): string {
  return JSON.stringify([
    item.employeeId,
    item.businessDate,
    item.templateId,
    item.kind,
    item.positionId ?? null,
    item.teamId ?? null,
    item.zoneId ?? null,
    item.customStart ?? null,
    item.customEnd ?? null,
    plan.planStartAt.toISOString(),
    plan.planEndAt.toISOString(),
    (item.segments ?? []).map((segment) => [segment.zoneId, segment.localStart, segment.localEnd]),
    (item.breaks ?? []).map((pause) => [
      pause.localStart,
      pause.localEnd,
      pause.reliefEmployeeId ?? null,
    ]),
  ]);
}
