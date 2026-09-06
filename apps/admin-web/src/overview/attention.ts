import { useCallback, useEffect, useState } from 'react';
import type { MeView } from '@vakhta/contracts';
import { employeesApi, handoversApi, incidentsApi, orgApi, requestsApi, shiftsApi } from '@/api';

export interface Attention {
  readonly onShift: number | null;
  readonly inDowntime: number | null;
  readonly openIncidents: number | null;
  readonly slaBreached: number | null;
  readonly disputes: number | null;
  readonly overdueAcceptances: number | null;
  readonly requestsForMe: number | null;
  readonly overdueRequests: number | null;
  readonly overtimePending: number | null;
  readonly unlinkedEmployees: number | null;
  readonly unpairedTerminals: number | null;
  readonly refreshedAt: Date | null;
}

const EMPTY: Attention = {
  onShift: null,
  inDowntime: null,
  openIncidents: null,
  slaBreached: null,
  disputes: null,
  overdueAcceptances: null,
  requestsForMe: null,
  overdueRequests: null,
  overtimePending: null,
  unlinkedEmployees: null,
  unpairedTerminals: null,
  refreshedAt: null,
};

const OPS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];
const HANDOVER = [...OPS, 'CLEANLINESS_CONTROLLER'];
const REQUESTS = [...OPS, 'HR', 'PLANNER', 'AUDITOR'];
const EMPLOYEES = [...OPS, 'HR', 'PLANNER'];

function may(me: MeView, roles: readonly string[]): boolean {
  return me.roles.some((g) => roles.includes(g.role));
}

/**
 * The numbers behind the overview tiles and the sidebar badges: what is waiting on someone
 * right now, fetched for the queues the signed-in role may see, refreshed every minute.
 */
export function useAttention(me: MeView, intervalMs = 60_000) {
  const [data, setData] = useState<Attention>(EMPTY);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    const [shifts, incidents, handovers, disputes, requests, overtime, employees, org] =
      await Promise.all([
        may(me, OPS) ? shiftsApi.list({}).catch(() => null) : null,
        may(me, OPS) ? incidentsApi.list({ scope: 'open' }).catch(() => null) : null,
        may(me, HANDOVER) ? handoversApi.list({ scope: 'overdue' }).catch(() => null) : null,
        may(me, HANDOVER) ? handoversApi.list({ scope: 'pending' }).catch(() => null) : null,
        may(me, REQUESTS) ? requestsApi.list({ scope: 'inbox' }).catch(() => null) : null,
        may(me, OPS) ? requestsApi.overtime('pending').catch(() => null) : null,
        may(me, EMPLOYEES) ? employeesApi.list().catch(() => null) : null,
        orgApi.snapshot().catch(() => null),
      ]);
    setData({
      onShift: shifts ? shifts.filter((s) => s.endedAt === null).length : null,
      inDowntime: shifts ? shifts.filter((s) => s.state === 'DOWNTIME').length : null,
      openIncidents: incidents ? incidents.length : null,
      slaBreached: incidents ? incidents.filter((i) => i.slaBreached).length : null,
      disputes: disputes ? disputes.filter((h) => h.status === 'DISPUTED').length : null,
      overdueAcceptances: handovers ? handovers.length : null,
      requestsForMe: requests ? requests.length : null,
      overdueRequests: requests ? requests.filter((r) => r.overdue).length : null,
      overtimePending: overtime ? overtime.length : null,
      unlinkedEmployees: employees
        ? employees.filter((e) => e.status === 'ACTIVE' && !e.telegramLinked).length
        : null,
      unpairedTerminals: org ? org.terminals.filter((t) => !t.paired).length : null,
      refreshedAt: new Date(),
    });
  }, [me]);

  useEffect(() => {
    let alive = true;
    const run = () =>
      refresh().catch((e: unknown) => {
        if (alive) setError(e);
      });
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}
