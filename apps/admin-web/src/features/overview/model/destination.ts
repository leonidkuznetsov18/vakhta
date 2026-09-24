import type { ActiveShiftView } from '@vakhta/contracts';
import { TerminalConnectivity } from '@vakhta/domain';
import type { Attention } from './attention';

export type AttentionKey = keyof Omit<
  Attention,
  | 'refreshedAt'
  | 'unscheduledPeople'
  | 'people'
  | 'firstId'
  | 'firstDate'
  | 'oldestAt'
  | 'deadlineAt'
>;

/** The overview's site/unit selection, carried into the destination's own filters (AC-008). */
export interface OverviewSelection {
  readonly siteId: string | null;
  readonly orgUnitId: string | null;
}

const NO_SELECTION: OverviewSelection = { siteId: null, orgUnitId: null };

/** The state filter that lists exactly the shifts a card counted, so they are not lost in the day. */
const OPERATIONS_GROUP: Record<'onShift' | 'inDowntime' | 'closedNoChecklist', string> = {
  onShift: 'ALL',
  inDowntime: 'DOWNTIME',
  closedNoChecklist: 'CLOSED',
};

/** Clear only destination filters, never drafts, so remembered filters cannot hide the counted row. */
export function attentionFilters(
  key: AttentionKey,
  data: Attention,
  selection: OverviewSelection = NO_SELECTION,
): Record<string, unknown> {
  switch (key) {
    case 'pendingHandovers':
      return {
        'handover.scope': 'pending',
        'handover.date': '',
        'handover.siteId': selection.siteId ?? '',
        'search.handover': '',
      };
    case 'openIncidents':
    case 'safetyIncidents':
    case 'slaBreached':
      return {
        'incidents.scope': 'open',
        'incidents.period': 'all',
        'incidents.siteId': selection.siteId ?? '',
        'search.incidents': '',
      };
    case 'requestsForMe':
    case 'overdueRequests':
    case 'overtimePending':
      return {
        'requests.scope': 'inbox',
        'search.requests': '',
        'search.requests-overtime': '',
      };
    case 'onShift':
    case 'inDowntime':
    case 'closedNoChecklist':
      return {
        'operations.scope': key === 'closedNoChecklist' ? 'ALL' : 'OPEN',
        'operations.day': data.firstDate[key] ?? '',
        'operations.siteId': selection.siteId ?? '',
        'operations.orgUnitId': selection.orgUnitId ?? '',
        'operations.group': OPERATIONS_GROUP[key],
        'search.operations': '',
      };
    case 'unlinkedEmployees':
      return {
        'employees.status': 'ACTIVE',
        'employees.telegram': 'NOT_LINKED',
        'search.employees': '',
        'employees.openId': null,
      };
    case 'unpairedTerminals':
      return {
        'search.terminals': '',
        'terminals.openId': null,
        'terminals.connectivity': TerminalConnectivity.UNPAIRED,
      };
    case 'unscheduled':
      return {};
  }
}

/** People selected in Overview; the page decides how to enter the planning workflow. */
export interface OverviewPlanningTarget {
  readonly orgUnitId: string | null;
  readonly people: readonly Pick<ActiveShiftView, 'employeeId' | 'fullName' | 'businessDate'>[];
}
