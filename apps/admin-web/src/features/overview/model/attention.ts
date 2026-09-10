import type {
  ActiveShiftView,
  HandoverListItemView,
  IncidentView,
  RequestView,
  OvertimeView,
  EmployeeView,
  OrgSnapshot,
} from '@vakhta/contracts';
import { isActive, isOpenIncident, isHandoverPending, isRequestOpen } from '@vakhta/domain';
import type { StackedPerson } from '@/components/app/avatar-stack';

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
  readonly pendingHandovers: number | null;
  readonly requestsForMe: number | null;
  readonly overdueRequests: number | null;
  readonly overtimePending: number | null;
  readonly unlinkedEmployees: number | null;
  readonly unpairedTerminals: number | null;
  readonly refreshedAt: Date | null;
}

export interface AttentionSources {
  readonly shifts: readonly ActiveShiftView[] | null;
  readonly incidents:
    | readonly Pick<
        IncidentView,
        'id' | 'status' | 'acknowledgedAt' | 'resolvedAt' | 'slaBreached'
      >[]
    | null;
  readonly handovers:
    readonly Pick<HandoverListItemView, 'id' | 'status' | 'submittedByName' | 'zoneName'>[] | null;
  readonly requests:
    readonly Pick<RequestView, 'id' | 'status' | 'employeeName' | 'overdue'>[] | null;
  readonly overtime:
    readonly Pick<OvertimeView, 'shiftSessionId' | 'employeeName' | 'status'>[] | null;
  readonly employees:
    | readonly Pick<
        EmployeeView,
        'id' | 'status' | 'fullName' | 'personnelNumber' | 'telegramLinked'
      >[]
    | null;
  readonly org: Pick<OrgSnapshot, 'terminals'> | null;
}

/** Counters, people and destinations derive from the same eligible records. Missing data is unknown. */
export function buildAttention(source: AttentionSources, refreshedAt: Date | null): Attention {
  const { shifts, employees, org } = source;
  const incidents = source.incidents?.filter((i) => isOpenIncident(i.status)) ?? null;
  const handovers = source.handovers?.filter((h) => isHandoverPending(h.status)) ?? null;
  const requests = source.requests?.filter((r) => isRequestOpen(r.status)) ?? null;
  const overtime = source.overtime?.filter((r) => r.status === 'PENDING') ?? null;
  const unansweredBreaches = (incidents ?? []).filter(
    (i) => !i.acknowledgedAt && !i.resolvedAt && i.slaBreached,
  );
  const unscheduledPeople = (shifts ?? []).filter(
    (s) => s.endedAt === null && isActive(s.state) && s.assignmentId === null,
  );
  const person = (id: string, name: string, note?: string | null | undefined): StackedPerson => ({
    id,
    name,
    seed: id,
    ...(note ? { note } : {}),
  });
  const onShiftNow = (shifts ?? []).filter((s) => s.endedAt === null && isActive(s.state));
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
      pendingHandovers: (handovers ?? []).map((h) => person(h.id, h.submittedByName, h.zoneName)),
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
      slaBreached: unansweredBreaches[0]?.id,
      pendingHandovers: handovers?.[0]?.id,
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
    slaBreached: incidents ? unansweredBreaches.length : null,
    pendingHandovers: handovers ? handovers.length : null,
    requestsForMe: requests ? requests.length : null,
    overdueRequests: requests ? requests.filter((r) => r.overdue).length : null,
    overtimePending: overtime ? overtime.length : null,
    unlinkedEmployees: employees
      ? employees.filter((e) => e.status === 'ACTIVE' && !e.telegramLinked).length
      : null,
    unpairedTerminals: org
      ? org.terminals.filter((t) => t.status === 'ACTIVE' && !t.paired).length
      : null,
    refreshedAt,
  };
}
