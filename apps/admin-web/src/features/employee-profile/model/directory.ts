import { queryOptions } from '@tanstack/react-query';
import { keys } from '@/lib/query';
import { type EmployeeView, type OrgSnapshot, type MeView } from '@vakhta/contracts';
import { canActOn } from '@vakhta/domain';
import { readEmployeePage } from '@/entities/employee';

/** Load every cursor page before client-side filtering or master selection. */
export async function profileDirectory(signal?: AbortSignal): Promise<EmployeeView[]> {
  const employees: EmployeeView[] = [];
  let after: string | null = null;
  const visited = new Set<string>();
  do {
    const page = await readEmployeePage({ limit: 200, ...(after ? { after } : {}) }, signal);
    employees.push(...page.items);
    if (page.nextCursor && visited.has(page.nextCursor))
      throw new Error('Employee cursor did not advance');
    if (page.nextCursor) visited.add(page.nextCursor);
    after = page.nextCursor;
  } while (after);
  return employees;
}
export function canEditEmployee(employee: EmployeeView, org: OrgSnapshot, roles: MeView['roles']) {
  const position = employee.currentPosition;
  const unit = org.orgUnits.find((item) => item.id === position?.orgUnitId);
  return canActOn(roles, ['ADMIN', 'HR'], {
    siteId: unit?.siteId,
    orgUnitId: position?.orgUnitId,
    teamId: position?.teamId ?? undefined,
  });
}

export function profileDirectoryOptions() {
  return queryOptions({
    queryKey: [...keys.employees, 'complete-directory'],
    queryFn: ({ signal }) => profileDirectory(signal),
  });
}
