import type { PlannedShift } from './types.js';

export interface ShiftChange {
  readonly before: PlannedShift;
  readonly after: PlannedShift;
}

export interface EmployeeChanges {
  readonly added: readonly PlannedShift[];
  readonly removed: readonly PlannedShift[];
  readonly changed: readonly ShiftChange[];
}

function sameShift(a: PlannedShift, b: PlannedShift): boolean {
  return (
    a.planStartAt.getTime() === b.planStartAt.getTime() &&
    a.planEndAt.getTime() === b.planEndAt.getTime() &&
    a.zoneId === b.zoneId &&
    a.templateCode === b.templateCode
  );
}

/**
 * Різниця між попередньою опублікованою версією і новою по кожному працівнику (FR-SCH-03):
 * що додано, що скасовано, що змінено. Зміни зіставляються за діловою датою.
 */
export function diffSchedules(
  previous: readonly PlannedShift[],
  next: readonly PlannedShift[],
): Map<string, EmployeeChanges> {
  const employees = new Set([...previous, ...next].map((s) => s.employeeId));
  const result = new Map<string, EmployeeChanges>();

  for (const employeeId of employees) {
    const prevByDate = new Map(
      previous.filter((s) => s.employeeId === employeeId).map((s) => [s.businessDate, s]),
    );
    const nextByDate = new Map(
      next.filter((s) => s.employeeId === employeeId).map((s) => [s.businessDate, s]),
    );
    const added: PlannedShift[] = [];
    const removed: PlannedShift[] = [];
    const changed: ShiftChange[] = [];

    for (const [date, after] of nextByDate) {
      const before = prevByDate.get(date);
      if (!before) added.push(after);
      else if (!sameShift(before, after)) changed.push({ before, after });
    }
    for (const [date, before] of prevByDate) {
      if (!nextByDate.has(date)) removed.push(before);
    }
    if (added.length || removed.length || changed.length) {
      result.set(employeeId, { added, removed, changed });
    }
  }
  return result;
}
