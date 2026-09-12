import { useQuery } from '@tanstack/react-query';
import type { EmployeeView, EmployeesPage } from '@vakhta/contracts';
import { keys } from '@/lib/query';
import { scheduleApi } from '../api/schedule-api';

type ReadPage = (after: string | undefined, signal: AbortSignal) => Promise<EmployeesPage>;

/** Publish only a complete directory; obsolete scopes abort every page through Query's signal. */
export async function loadScheduleRoster(
  signal: AbortSignal,
  readPage: ReadPage = scheduleApi.employeesPage,
) {
  const employees: EmployeeView[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  let total: number | undefined;
  do {
    signal.throwIfAborted();
    const page = await readPage(after, signal);
    signal.throwIfAborted();
    if (total !== undefined && page.total !== total)
      throw new Error('Employee directory changed during pagination');
    total = page.total;
    let previous = after;
    for (const employee of page.items) {
      if (seen.has(employee.id) || (previous && employee.id <= previous)) {
        throw new Error('Employee directory page did not progress');
      }
      previous = employee.id;
      seen.add(employee.id);
      employees.push(employee);
    }
    if (employees.length > total) throw new Error('Employee directory total is inconsistent');
    if (
      page.nextCursor &&
      (page.nextCursor !== page.items.at(-1)?.id || page.nextCursor === after)
    ) {
      throw new Error('Employee directory cursor is inconsistent');
    }
    if (page.nextCursor && employees.length >= total)
      throw new Error('Employee directory cursor exceeds its total');
    after = page.nextCursor ?? undefined;
  } while (after);
  if (employees.length !== total) throw new Error('Employee directory is incomplete');
  return employees;
}

export function useScheduleRoster(enabled: boolean) {
  const query = useQuery({
    queryKey: keys.scheduleRoster,
    queryFn: ({ signal }) => loadScheduleRoster(signal),
    enabled,
  });
  const employees = query.data ?? [];
  return {
    employees,
    active: employees.filter((employee) => employee.status === 'ACTIVE'),
    loaded: query.data !== undefined,
    queryState: query,
    error: query.error,
  };
}
