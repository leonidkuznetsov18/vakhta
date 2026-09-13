import { EmployeesPage, type EmployeeView, type OrgSnapshot, type MeView } from '@vakhta/contracts';
import { canActOn } from '@vakhta/domain';
import { apiFetch } from '@/api';

/** Load every cursor page before client-side filtering or master selection. */
export async function profileDirectory(signal?: AbortSignal): Promise<EmployeeView[]> {
  const employees: EmployeeView[] = [];
  let after: string | null = null;
  do {
    const page = EmployeesPage.parse(
      await apiFetch(`/admin/employees/page?limit=200${after ? `&after=${after}` : ''}`, {
        signal,
      }),
    );
    employees.push(...page.items);
    if (page.nextCursor === after && after) throw new Error('Employee cursor did not advance');
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
