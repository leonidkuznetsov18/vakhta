import { useQuery } from '@tanstack/react-query';
import type { ActiveShiftView, MeView } from '@vakhta/contracts';
import type { StackedPerson } from '@/components/app/avatar-stack';
import { employeesApi, handoversApi, incidentsApi, orgApi, requestsApi, shiftsApi } from '@/api';

export interface Attention {
  readonly onShift: number | null;
  readonly unscheduled: number | null;
  /** Who is on an unscheduled shift right now, so the banner can name them. */
  readonly unscheduledPeople: readonly ActiveShiftView[];
  /**
   * The people behind a counter, by tile. A number says how much is waiting; the faces say on whom,
   * which is what turns the overview from a report into something to act on.
   */
  readonly people: Readonly<Partial<Record<keyof Attention, readonly StackedPerson[]>>>;
  /**
   * The row a tile should open on arrival: landing on a filtered list still leaves the reader
   * hunting for what the number stood for, and with one row there is nothing to choose anyway.
   */
  readonly firstId: Readonly<Partial<Record<keyof Attention, string>>>;
  /**
   * The business date that row belongs to. The live-shift screen stands on a day, and a shift
   * closed last night or a night shift started yesterday is not on today's — the tile has to carry
   * the day with it or the list it opens is empty.
   */
  readonly firstDate: Readonly<Partial<Record<keyof Attention, string>>>;
  readonly closedNoChecklist: number | null;
  readonly inDowntime: number | null;
  readonly openIncidents: number | null;
  readonly slaBreached: number | null;
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
  unscheduled: null,
  unscheduledPeople: [],
  people: {},
  firstId: {},
  firstDate: {},
  closedNoChecklist: null,
  inDowntime: null,
  openIncidents: null,
  slaBreached: null,
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
  const query = useQuery({
    queryKey: ['attention', me.roles.map((g) => g.role).sort()],
    refetchInterval: intervalMs,
    queryFn: async (): Promise<Attention> => {
      const [shifts, incidents, handovers, requests, overtime, employees, org] = await Promise.all([
        may(me, OPS) ? shiftsApi.list({ scope: 'ALL' }).catch(() => null) : null,
        may(me, OPS) ? incidentsApi.list({ scope: 'open' }).catch(() => null) : null,
        may(me, HANDOVER) ? handoversApi.list({ scope: 'overdue' }).catch(() => null) : null,
        may(me, REQUESTS) ? requestsApi.list({ scope: 'inbox' }).catch(() => null) : null,
        may(me, OPS) ? requestsApi.overtime('pending').catch(() => null) : null,
        may(me, EMPLOYEES) ? employeesApi.list().catch(() => null) : null,
        orgApi.snapshot().catch(() => null),
      ]);
      const unscheduledPeople = (shifts ?? []).filter(
        (s) => s.endedAt === null && s.assignmentId === null,
      );
      const person = (
        id: string,
        name: string,
        note?: string | null | undefined,
      ): StackedPerson => ({
        id,
        name,
        seed: id,
        ...(note ? { note } : {}),
      });
      const onShiftNow = (shifts ?? []).filter((s) => s.endedAt === null);
      const noChecklist = (shifts ?? []).filter(
        (s) => s.endedAt !== null && s.autoCloseReason === 'NO_CHECKLIST',
      );
      return {
        people: {
          onShift: onShiftNow.map((s) => person(s.id, s.fullName, s.orgUnitName)),
          unscheduled: unscheduledPeople.map((s) => person(s.id, s.fullName, s.orgUnitName)),
          closedNoChecklist: noChecklist.map((s) => person(s.id, s.fullName, s.businessDate)),
          inDowntime: onShiftNow
            .filter((s) => s.state === 'DOWNTIME')
            .map((s) => person(s.id, s.fullName, s.orgUnitName)),
          overdueAcceptances: (handovers ?? []).map((h) =>
            person(h.id, h.submittedByName, h.zoneName),
          ),
          requestsForMe: (requests ?? []).map((r) => person(r.id, r.employeeName)),
          overdueRequests: (requests ?? [])
            .filter((r) => r.overdue)
            .map((r) => person(r.id, r.employeeName)),
          overtimePending: (overtime ?? []).map((r) => person(r.shiftSessionId, r.employeeName)),
          unlinkedEmployees: (employees ?? [])
            .filter((e) => e.status === 'ACTIVE' && !e.telegramLinked)
            .map((e) => person(e.id, e.fullName, e.personnelNumber)),
        },
        firstDate: {
          onShift: onShiftNow[0]?.businessDate,
          closedNoChecklist: noChecklist[0]?.businessDate,
          inDowntime: onShiftNow.find((s) => s.state === 'DOWNTIME')?.businessDate,
        },
        firstId: {
          onShift: onShiftNow[0]?.id,
          closedNoChecklist: noChecklist[0]?.id,
          inDowntime: onShiftNow.find((s) => s.state === 'DOWNTIME')?.id,
          openIncidents: incidents?.[0]?.id,
          slaBreached: incidents?.find((i) => i.slaBreached)?.id,
          overdueAcceptances: handovers?.[0]?.id,
          requestsForMe: requests?.[0]?.id,
          overdueRequests: requests?.find((r) => r.overdue)?.id,
          // The requests page reads one id for both its tables; an overtime row is addressed by the
          // shift it belongs to.
          overtimePending: overtime?.[0]?.shiftSessionId,
        },
        onShift: shifts ? onShiftNow.length : null,
        unscheduled: unscheduledPeople.length > 0 || shifts ? unscheduledPeople.length : null,
        unscheduledPeople,
        closedNoChecklist: shifts ? noChecklist.length : null,
        inDowntime: shifts ? onShiftNow.filter((s) => s.state === 'DOWNTIME').length : null,
        openIncidents: incidents ? incidents.length : null,
        slaBreached: incidents ? incidents.filter((i) => i.slaBreached).length : null,
        overdueAcceptances: handovers ? handovers.length : null,
        requestsForMe: requests ? requests.length : null,
        overdueRequests: requests ? requests.filter((r) => r.overdue).length : null,
        overtimePending: overtime ? overtime.length : null,
        unlinkedEmployees: employees
          ? employees.filter((e) => e.status === 'ACTIVE' && !e.telegramLinked).length
          : null,
        unpairedTerminals: org ? org.terminals.filter((t) => !t.paired).length : null,
        refreshedAt: new Date(),
      };
    },
  });
  return { data: query.data ?? EMPTY, error: query.error, refresh: query.refetch };
}
