/** A published, planned assignment overlapping the shift window. */
export interface PlannedAssignment {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
}

/** Evidence that a person came: a presence or a shift session, linked to an assignment or not. */
export interface Arrival {
  readonly employeeId: string;
  readonly assignmentId: string | null;
}

export interface StaffingSnapshot {
  /** Planned assignments in the window; approved absences already left the published plan. */
  readonly planned: number;
  readonly present: number;
  /** Plan start plus the late grace has passed and nothing records the person. */
  readonly notArrived: number;
  /** Plan start plus grace has not come yet. */
  readonly expected: number;
  /** People present in scope with no planned assignment in the window. */
  readonly unscheduled: number;
  readonly notArrivedEmployeeIds: readonly string[];
  readonly unscheduledEmployeeIds: readonly string[];
  /** Earliest plan start among the not-arrived, for "planned 08:00" and the age of the gap. */
  readonly oldestNotArrivedSince: Date | null;
}

/**
 * Planned vs present for the current shift (spec 004 D-03). A factual gap, not an absence
 * verdict: there is no no-show detection, so "not arrived" only says nothing was recorded.
 */
export function staffingSnapshot(
  planned: readonly PlannedAssignment[],
  arrivals: readonly Arrival[],
  now: Date,
  graceMinutes: number,
): StaffingSnapshot {
  const byAssignment = new Set(arrivals.flatMap((a) => (a.assignmentId ? [a.assignmentId] : [])));
  const byEmployee = new Set(arrivals.map((a) => a.employeeId));
  const plannedEmployees = new Set(planned.map((p) => p.employeeId));
  let present = 0;
  let expected = 0;
  const notArrived: PlannedAssignment[] = [];
  for (const p of planned) {
    if (byAssignment.has(p.assignmentId) || byEmployee.has(p.employeeId)) present += 1;
    else if (now.getTime() >= p.planStartAt.getTime() + graceMinutes * 60_000) notArrived.push(p);
    else expected += 1;
  }
  const unscheduled = [...byEmployee].filter((id) => !plannedEmployees.has(id));
  notArrived.sort((a, b) => a.planStartAt.getTime() - b.planStartAt.getTime());
  return {
    planned: planned.length,
    present,
    notArrived: notArrived.length,
    expected,
    unscheduled: unscheduled.length,
    notArrivedEmployeeIds: notArrived.map((p) => p.employeeId),
    unscheduledEmployeeIds: unscheduled.sort(),
    oldestNotArrivedSince: notArrived[0]?.planStartAt ?? null,
  };
}
