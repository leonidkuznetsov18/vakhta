import type { AssignmentInput } from '@vakhta/contracts';
import { EligibilitySeverity, type EligibilityReason } from '@vakhta/domain';
import type { Messages } from '@vakhta/i18n';
import { isTerminated } from './employee-status';
import {
  assignmentKey,
  gridToItems,
  sameAssignment,
  setAssignment,
  setCell,
  type GridState,
} from './grid';
import { zoneAllowed } from './planning';
import { moveAssignment, MoveFailure } from './batch';
import { planIssues, reasonText, reasonsFor } from './use-eligibility';
import type { Workspace } from './use-workspace';

/** What the signed-in account may do with one shift, the same in every period view. */
export interface AssignmentAbilities {
  readonly terminated: boolean;
  /** The zone scope forbids changing it (D-01); it stays readable. */
  readonly locked: boolean;
  /** Explicit removal stays available for a terminated worker's shift. */
  readonly removable: boolean;
  readonly editable: boolean;
  /** The saved version of the shift; undefined when it was added locally. */
  readonly saved: AssignmentInput | undefined;
  readonly locallyChanged: boolean;
}

type AbilityWorkspace = Pick<Workspace, 'writable' | 'rights' | 'baseline' | 'employees'>;

export function assignmentAbilities(
  w: AbilityWorkspace,
  item: AssignmentInput,
): AssignmentAbilities {
  const terminated = isTerminated(w.employees.find((employee) => employee.id === item.employeeId));
  const locked = !zoneAllowed(w.rights.zones, item.zoneId);
  const removable = w.writable && !locked;
  const saved = gridToItems(w.baseline).find(
    (value) => assignmentKey(value) === assignmentKey(item),
  );
  return {
    terminated,
    locked,
    removable,
    editable: removable && !terminated,
    saved,
    locallyChanged: !saved || !sameAssignment(saved, item),
  };
}

export function removeAssignment(
  grid: GridState,
  item: Pick<AssignmentInput, 'employeeId' | 'businessDate'>,
): GridState {
  return setCell(grid, item.employeeId, item.businessDate, '');
}

/** Puts the saved shift back, or drops a shift that only exists locally. */
export function revertAssignment(
  grid: GridState,
  item: AssignmentInput,
  saved: AssignmentInput | undefined,
): GridState {
  return saved ? setAssignment(grid, saved) : removeAssignment(grid, item);
}

export interface MoveTarget {
  readonly employeeId?: string;
  readonly businessDate: string;
  /** Present when the drop row is a zone: null is the "without a zone" row. */
  readonly zoneId?: string | null;
}

type MoveWorkspace = Pick<
  Workspace,
  | 'grid'
  | 'month'
  | 'orgUnitId'
  | 'templates'
  | 'timezone'
  | 'staffing'
  | 'context'
  | 'rights'
  | 'writable'
  | 'employees'
  | 'units'
  | 'zones'
>;
type WorkspaceText = Messages['scheduleWorkspace'];

const MOVE_FAILURE_MESSAGE: Record<MoveFailure, keyof WorkspaceText | null> = {
  [MoveFailure.OCCUPIED]: 'moveInvalidOccupied',
  [MoveFailure.OUTSIDE_MONTH]: 'moveInvalidMonth',
  [MoveFailure.SAME]: null,
};

/** A move the account may not make at all; it is refused without a message. */
function moveRefused(w: MoveWorkspace, item: AssignmentInput, target: MoveTarget): boolean {
  if (!w.writable || !zoneAllowed(w.rights.zones, item.zoneId)) return true;
  const employees = new Map(w.employees.map((employee) => [employee.id, employee]));
  if (isTerminated(employees.get(item.employeeId))) return true;
  return !!target.employeeId && isTerminated(employees.get(target.employeeId));
}

function blockingReasons(
  w: MoveWorkspace,
  grid: GridState,
  shift: Pick<AssignmentInput, 'employeeId' | 'businessDate'>,
): EligibilityReason[] {
  const issues = planIssues({
    grid,
    month: w.month,
    orgUnitId: w.orgUnitId,
    templates: w.templates,
    timezone: w.timezone,
    staffing: w.staffing,
    context: w.context,
  });
  return reasonsFor(issues.reasons, shift.employeeId, shift.businessDate).filter(
    (reason) => reason.severity === EligibilitySeverity.BLOCK,
  );
}

/**
 * Drag shares the Move command with the editor: an invalid target leaves the plan unchanged and
 * explains why; a silently refused move (no rights, terminated worker) returns no message.
 */
export function checkedMove(input: {
  readonly workspace: MoveWorkspace;
  readonly item: AssignmentInput;
  readonly target: MoveTarget;
  readonly t: WorkspaceText;
}): { readonly grid: GridState } | { readonly error: string | null } {
  const { workspace: w, item, target, t } = input;
  if (moveRefused(w, item, target)) return { error: null };
  if (target.zoneId !== undefined && !zoneAllowed(w.rights.zones, target.zoneId))
    return { error: t.zoneScope };
  const result = moveAssignment(
    w.grid,
    item,
    {
      businessDate: target.businessDate,
      ...(target.employeeId ? { employeeId: target.employeeId } : {}),
      ...(target.zoneId ? { zoneId: target.zoneId } : {}),
    },
    w.month,
  );
  if ('failure' in result) {
    const key = MOVE_FAILURE_MESSAGE[result.failure];
    return { error: key ? t[key] : null };
  }
  const blocking = blockingReasons(w, result.grid, {
    employeeId: target.employeeId ?? item.employeeId,
    businessDate: target.businessDate,
  });
  if (blocking.length === 0) return { grid: result.grid };
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
  };
  return {
    error: `${t.moveInvalidBlocked} ${blocking.map((reason) => reasonText(reason, labels)).join(' · ')}`,
  };
}
