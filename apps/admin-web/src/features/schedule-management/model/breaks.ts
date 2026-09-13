import type { AssignmentInput, ShiftTemplateView } from '@vakhta/contracts';
import { assignmentInstants, resolveBreaks, type PlannedBreak } from '@vakhta/domain';

/** Planned break instants of one assignment; an invalid list yields none (the editor reports it). */
export function plannedBreaks(
  item: AssignmentInput,
  template: ShiftTemplateView | undefined,
  timezone: string,
): PlannedBreak[] {
  if (!template || !item.breaks || item.breaks.length === 0) return [];
  const plan = assignmentInstants({ ...item, template }, timezone);
  const resolved = resolveBreaks(
    { ...plan, businessDate: item.businessDate },
    item.breaks,
    timezone,
  );
  if ('error' in resolved) return [];
  return resolved.breaks.map((pause) => ({
    startMs: pause.startAt.getTime(),
    endMs: pause.endAt.getTime(),
    reliefEmployeeId: pause.reliefEmployeeId ?? null,
  }));
}

/** Planned break minutes of one assignment. */
export function breakMinutes(
  item: AssignmentInput,
  template: ShiftTemplateView | undefined,
  timezone: string,
): number {
  return plannedBreaks(item, template, timezone).reduce(
    (sum, pause) => sum + (pause.endMs - pause.startMs) / 60000,
    0,
  );
}
