import { useQuery } from '@tanstack/react-query';
import type { EmployeeView, OrgSnapshot } from '@vakhta/contracts';
import { employeesApi, orgApi } from '@/api';
import { keys } from '@/lib/query';

const EMPTY: OrgSnapshot = {
  sites: [],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

/**
 * Sites, units, zones, positions and reason codes: the directories nearly every screen filters by.
 * One query behind one key, so six sections share a single read and a change made in the
 * administration section reaches all of them at once.
 */
export function useOrg(enabled = true) {
  const query = useQuery({ queryKey: keys.org, queryFn: () => orgApi.snapshot(), enabled });
  return {
    org: query.data ?? null,
    orgOrEmpty: query.data ?? EMPTY,
    error: query.error,
    queryState: query,
  };
}

/** The staff list, shared the same way. */
export function useEmployees(enabled = true) {
  const query = useQuery({ queryKey: keys.employees, queryFn: () => employeesApi.list(), enabled });
  const employees: readonly EmployeeView[] = query.data ?? [];
  return {
    employees,
    active: employees.filter((e) => e.status === 'ACTIVE'),
    /** The list has arrived: an empty roster reads differently from one still on its way. */
    loaded: query.data !== undefined,
    queryState: query,
    error: query.error,
  };
}
