import type { AssignmentInput } from '@vakhta/contracts';
import {
  assignmentChanges,
  assignmentKey,
  gridToItems,
  setAssignment,
  setCell,
  type AssignmentChange,
  type GridState,
} from './grid';

export interface CopySkip {
  readonly employeeId: string;
  readonly sourceDate: string;
  readonly targetDate: string;
  readonly reason: 'INACTIVE_EMPLOYEE' | 'INACTIVE_ZONE' | 'INACTIVE_TEMPLATE' | 'OCCUPIED';
}

export interface CopyResult {
  readonly grid: GridState;
  readonly changes: readonly AssignmentChange[];
  readonly skipped: readonly CopySkip[];
}

/**
 * Copies a source period onto a target period by position (SC-26): the n-th source date maps to
 * the n-th target date. Inactive references are skipped and reported, fill-empty keeps occupied
 * target dates, replace clears target dates of the copied people first. Never publishes.
 */
export function copyPeriod(input: {
  readonly grid: GridState;
  /** Assignments of the source dates, possibly from another month's plan. */
  readonly source: GridState;
  readonly sourceDates: readonly string[];
  readonly targetDates: readonly string[];
  readonly mode: 'fill' | 'replace';
  readonly employeeIds?: readonly string[];
  readonly activeEmployees: ReadonlySet<string>;
  readonly activeZones: ReadonlySet<string>;
  readonly activeTemplates: ReadonlySet<string>;
}): CopyResult {
  const skipped: CopySkip[] = [];
  const mapping = new Map<string, string>();
  input.sourceDates.forEach((date, index) => {
    const target = input.targetDates[index];
    if (target) mapping.set(date, target);
  });
  const people = input.employeeIds ? new Set(input.employeeIds) : null;
  const sourceItems = gridToItems(input.source).filter(
    (item) => mapping.has(item.businessDate) && (!people || people.has(item.employeeId)),
  );
  let next = input.grid;
  if (input.mode === 'replace') {
    const copied = new Set(
      sourceItems
        .filter((item) => input.activeEmployees.has(item.employeeId))
        .map((item) => item.employeeId),
    );
    for (const item of gridToItems(input.grid))
      if (copied.has(item.employeeId) && input.targetDates.includes(item.businessDate))
        next = setCell(next, item.employeeId, item.businessDate, '');
  }
  const occupied = new Set(gridToItems(next).map(assignmentKey));
  for (const item of sourceItems) {
    const targetDate = mapping.get(item.businessDate);
    if (!targetDate) continue;
    const skip = (reason: CopySkip['reason']) =>
      skipped.push({
        employeeId: item.employeeId,
        sourceDate: item.businessDate,
        targetDate,
        reason,
      });
    if (!input.activeEmployees.has(item.employeeId)) {
      skip('INACTIVE_EMPLOYEE');
      continue;
    }
    if (item.zoneId && !input.activeZones.has(item.zoneId)) {
      skip('INACTIVE_ZONE');
      continue;
    }
    if (!input.activeTemplates.has(item.templateId)) {
      skip('INACTIVE_TEMPLATE');
      continue;
    }
    const key = assignmentKey({ employeeId: item.employeeId, businessDate: targetDate });
    if (occupied.has(key)) {
      skip('OCCUPIED');
      continue;
    }
    next = setAssignment(next, { ...item, businessDate: targetDate });
    occupied.add(key);
  }
  return { grid: next, changes: assignmentChanges(input.grid, next), skipped };
}

export type MoveFailure = 'SAME' | 'OCCUPIED' | 'OUTSIDE_MONTH';

/**
 * Moves one assignment to another person, date or zone with its metadata (SC-31). Drag and the
 * explicit Move action call this same function; an invalid move leaves the plan unchanged.
 */
export function moveAssignment(
  grid: GridState,
  item: AssignmentInput,
  target: {
    readonly employeeId?: string;
    readonly businessDate?: string;
    readonly zoneId?: string;
  },
  month: string,
): { readonly grid: GridState } | { readonly failure: MoveFailure } {
  const employeeId = target.employeeId ?? item.employeeId;
  const businessDate = target.businessDate ?? item.businessDate;
  const zoneId = target.zoneId ?? item.zoneId;
  if (!businessDate.startsWith(month)) return { failure: 'OUTSIDE_MONTH' };
  if (
    employeeId === item.employeeId &&
    businessDate === item.businessDate &&
    (zoneId ?? null) === (item.zoneId ?? null)
  )
    return { failure: 'SAME' };
  const movedKey = assignmentKey({ employeeId, businessDate });
  const ownKey = assignmentKey(item);
  if (
    movedKey !== ownKey &&
    gridToItems(grid).some((existing) => assignmentKey(existing) === movedKey)
  )
    return { failure: 'OCCUPIED' };
  const cleared = setCell(grid, item.employeeId, item.businessDate, '');
  const { zoneId: _previous, ...rest } = item;
  return {
    grid: setAssignment(cleared, {
      ...rest,
      employeeId,
      businessDate,
      ...(zoneId ? { zoneId } : {}),
    }),
  };
}
