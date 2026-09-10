/** Existing points-model nominations. Names and IDs break equal scores deterministically. */
export interface MonthNominee {
  readonly id: string;
  readonly name: string;
  readonly points: number;
}

export interface MonthMaster {
  readonly userId: string;
  readonly name: string;
  readonly employeeIds: readonly string[];
}

export interface MonthMasterCandidate extends MonthMaster {
  readonly orgUnitId: string;
}

export interface MonthNominations {
  readonly employeeOfMonth: MonthNominee | null;
  readonly unitOfMonth: MonthNominee | null;
  /** All masters of the winning department, including those without an employee card. */
  readonly masters: readonly MonthMaster[];
}

function byNameAndId(a: { name: string; id: string }, b: { name: string; id: string }): number {
  return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en');
}

function winner(candidates: readonly MonthNominee[]): MonthNominee | null {
  return (
    [...candidates]
      .filter((candidate) => candidate.points > 0)
      .sort((a, b) => b.points - a.points || byNameAndId(a, b))[0] ?? null
  );
}

/** Department candidates contain checklist points; employee candidates contain all ledger points. */
export function nominateMonth(
  employees: readonly MonthNominee[],
  departments: readonly MonthNominee[],
  masters: readonly MonthMasterCandidate[],
): MonthNominations {
  const unitOfMonth = winner(departments);
  const unique = new Map<string, MonthMaster>();
  for (const master of masters) {
    if (master.orgUnitId === unitOfMonth?.id) {
      unique.set(master.userId, {
        userId: master.userId,
        name: master.name,
        employeeIds: master.employeeIds,
      });
    }
  }
  return {
    employeeOfMonth: winner(employees),
    unitOfMonth,
    masters: [...unique.values()].sort((a, b) =>
      byNameAndId({ ...a, id: a.userId }, { ...b, id: b.userId }),
    ),
  };
}

/** The existing panel groups all department masters into one named nomination. */
export function masterNominee(nominations: MonthNominations): MonthNominee | null {
  const unit = nominations.unitOfMonth;
  return unit && nominations.masters.length > 0
    ? {
        id: unit.id,
        name: nominations.masters.map((master) => master.name).join(', '),
        points: unit.points,
      }
    : null;
}
