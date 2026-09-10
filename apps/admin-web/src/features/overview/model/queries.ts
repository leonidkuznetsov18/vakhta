import { useQueries } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { employeesApi, handoversApi, incidentsApi, orgApi, requestsApi, shiftsApi } from '@/api';
import { keys } from '@/lib/query';
import type { QueryFeedbackState } from '@/components/app/query-feedback';
import { buildAttention } from './attention';

const OPS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];
export function attentionPermissions(me: MeView) {
  const may = (roles: readonly string[]) =>
    me.id !== '' && me.roles.some((g) => roles.includes(g.role));
  return {
    shifts: may(OPS),
    incidents: may(OPS),
    overtime: may(OPS),
    handovers: may([...OPS, 'CLEANLINESS_CONTROLLER']),
    requests: may([...OPS, 'HR', 'PLANNER', 'AUDITOR']),
    employees: may([...OPS, 'HR', 'PLANNER']),
    org: me.id !== '',
  };
}

/** Shared list caches make decisions and page invalidation update cards and sidebar together. */
export function useAttention(me: MeView, intervalMs = 60_000) {
  const access = attentionPermissions(me);
  const options = { refetchInterval: intervalMs };
  const results = useQueries({
    queries: [
      {
        ...options,
        queryKey: keys.shifts({ scope: 'ALL' }),
        queryFn: () => shiftsApi.list({ scope: 'ALL' }),
        enabled: access.shifts,
      },
      {
        ...options,
        queryKey: keys.incidents({ scope: 'open' }),
        queryFn: () => incidentsApi.list({ scope: 'open' }),
        enabled: access.incidents,
      },
      {
        ...options,
        queryKey: keys.handovers({ scope: 'pending' }),
        queryFn: () => handoversApi.list({ scope: 'pending' }),
        enabled: access.handovers,
      },
      {
        ...options,
        queryKey: keys.requests({ scope: 'inbox' }),
        queryFn: () => requestsApi.list({ scope: 'inbox' }),
        enabled: access.requests,
      },
      {
        ...options,
        queryKey: keys.overtime('pending'),
        queryFn: () => requestsApi.overtime('pending'),
        enabled: access.overtime,
      },
      {
        ...options,
        queryKey: keys.employees,
        queryFn: () => employeesApi.list(),
        enabled: access.employees,
      },
      { ...options, queryKey: keys.org, queryFn: () => orgApi.snapshot(), enabled: access.org },
    ],
  });
  const [shifts, incidents, handovers, requests, overtime, employees, org] = results;
  const enabled = [
    access.shifts,
    access.incidents,
    access.handovers,
    access.requests,
    access.overtime,
    access.employees,
    access.org,
  ];
  const active = results.filter((_, index) => enabled[index]);
  const updated = active.map((q) => q.dataUpdatedAt).filter((at) => at > 0);
  const data = buildAttention(
    {
      shifts: access.shifts ? (shifts.data ?? null) : null,
      incidents: access.incidents ? (incidents.data ?? null) : null,
      handovers: access.handovers ? (handovers.data ?? null) : null,
      requests: access.requests ? (requests.data ?? null) : null,
      overtime: access.overtime ? (overtime.data ?? null) : null,
      employees: access.employees ? (employees.data ?? null) : null,
      org: access.org ? (org.data ?? null) : null,
    },
    updated.length ? new Date(Math.min(...updated)) : null,
  );
  const refresh = () => Promise.all(active.map((q) => q.refetch()));
  const incomplete = active.some(
    (q) => q.isError || q.data === undefined || q.fetchStatus === 'paused',
  );
  const failed = active.find((q) => q.isError);
  const queryState: QueryFeedbackState = {
    isPending: active.some((q) => q.isPending),
    isFetching: active.some((q) => q.isFetching),
    isError: Boolean(failed),
    error: failed?.error ?? null,
    fetchStatus: active.some((q) => q.fetchStatus === 'paused')
      ? 'paused'
      : active.some((q) => q.isFetching)
        ? 'fetching'
        : 'idle',
    refetch: refresh,
  };
  return { data, error: null, refresh, queryState, incomplete };
}
