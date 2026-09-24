import type {
  ActiveShiftView,
  OverviewPlannedPerson,
  OverviewStaffing,
  ShiftScope,
} from '@vakhta/contracts';
import type { ShiftState } from '@vakhta/domain';

const SHIFT_SCOPE_CLOSED: ShiftScope = 'CLOSED';

export const OperationsRowKind = {
  SHIFT: 'SHIFT',
  NOT_ARRIVED: 'NOT_ARRIVED',
} as const;

export const StateGroup = {
  ALL: 'ALL',
  NOT_ARRIVED: 'NOT_ARRIVED',
  WORKING: 'WORKING',
  BREAK: 'BREAK',
  MEAL: 'MEAL',
  SERVICE_TIME: 'SERVICE_TIME',
  DOWNTIME: 'DOWNTIME',
  NOT_STARTED: 'NOT_STARTED',
  CLOSED: 'CLOSED',
} as const;
export type StateGroup = (typeof StateGroup)[keyof typeof StateGroup];
export const STATE_GROUPS: readonly StateGroup[] = Object.values(StateGroup);

export interface ShiftRow {
  readonly kind: typeof OperationsRowKind.SHIFT;
  readonly key: string;
  readonly shift: ActiveShiftView;
}

/** A person on the published plan with no recorded arrival: no shift exists to show instead. */
export interface NotArrivedRow {
  readonly kind: typeof OperationsRowKind.NOT_ARRIVED;
  readonly key: string;
  readonly person: OverviewPlannedPerson;
  /** Minutes since the planned start at the time of the staffing snapshot. */
  readonly lateMinutes: number;
}

export type OperationsRow = ShiftRow | NotArrivedRow;

/**
 * The staffing snapshot describes the current shift only, so its no-shows belong to the list of
 * that business day, and never to a list of finished shifts.
 */
export function notArrivedApplies(
  staffing: OverviewStaffing | null | undefined,
  date: string,
  scope: ShiftScope,
): staffing is OverviewStaffing {
  if (!staffing || scope === SHIFT_SCOPE_CLOSED) return false;
  return staffing.businessDate === date;
}

/**
 * Shifts first as they come, then one row per missing person. An open shift proves the person is
 * here (they arrived after the snapshot was taken), so it wins; a closed one proves nothing about
 * the current shift and leaves the gap listed.
 */
export function operationsRows(
  shifts: readonly ActiveShiftView[],
  notArrived: readonly OverviewPlannedPerson[],
  generatedAt: string,
): OperationsRow[] {
  const rows: OperationsRow[] = shifts.map((shift) => ({
    kind: OperationsRowKind.SHIFT,
    key: shift.id,
    shift,
  }));
  const listed = new Set(shifts.filter((s) => s.endedAt === null).map((s) => s.employeeId));
  const at = Date.parse(generatedAt);
  for (const person of notArrived) {
    if (listed.has(person.employeeId)) continue;
    listed.add(person.employeeId);
    rows.push({
      kind: OperationsRowKind.NOT_ARRIVED,
      key: notArrivedKey(person.employeeId),
      person,
      lateMinutes: Math.max(0, Math.floor((at - Date.parse(person.planStartAt)) / 60_000)),
    });
  }
  return rows;
}

export function notArrivedKey(employeeId: string): string {
  return `not-arrived:${employeeId}`;
}

export function groupOf(row: OperationsRow): Exclude<StateGroup, 'ALL'> {
  switch (row.kind) {
    case OperationsRowKind.NOT_ARRIVED:
      return StateGroup.NOT_ARRIVED;
    case OperationsRowKind.SHIFT:
      return STATE_GROUP[row.shift.state];
  }
}

const STATE_GROUP: Record<ShiftState, Exclude<StateGroup, 'ALL' | 'NOT_ARRIVED'>> = {
  NOT_STARTED: StateGroup.NOT_STARTED,
  PREPARATION: StateGroup.WORKING,
  WORKING: StateGroup.WORKING,
  SERVICE_TIME: StateGroup.SERVICE_TIME,
  BREAK: StateGroup.BREAK,
  MEAL: StateGroup.MEAL,
  DOWNTIME: StateGroup.DOWNTIME,
  CLEANING: StateGroup.WORKING,
  HANDOVER: StateGroup.WORKING,
  READY_TO_CLOSE: StateGroup.WORKING,
  SHIFT_CLOSED: StateGroup.CLOSED,
  EMERGENCY_EXIT: StateGroup.CLOSED,
};

/** Exceptions first: review flags, downtime, emergency exits, then people who did not come. */
const REVIEW_RANK = 0;
const NOT_ARRIVED_RANK = 3;
const STATE_RANK: Partial<Record<ShiftState, number>> = { DOWNTIME: 1, EMERGENCY_EXIT: 2 };
const DEFAULT_RANK = 4;

function rank(row: OperationsRow): number {
  if (row.kind === OperationsRowKind.NOT_ARRIVED) return NOT_ARRIVED_RANK;
  if (row.shift.needsClarification) return REVIEW_RANK;
  return STATE_RANK[row.shift.state] ?? DEFAULT_RANK;
}

export function groupCounts(rows: readonly OperationsRow[]): Record<StateGroup, number> {
  const counts = Object.fromEntries(STATE_GROUPS.map((g) => [g, 0])) as Record<StateGroup, number>;
  counts.ALL = rows.length;
  for (const row of rows) counts[groupOf(row)] += 1;
  return counts;
}

export function visibleRows(rows: readonly OperationsRow[], group: StateGroup): OperationsRow[] {
  const shown = group === StateGroup.ALL ? [...rows] : rows.filter((r) => groupOf(r) === group);
  return shown.sort((a, b) => rank(a) - rank(b));
}
