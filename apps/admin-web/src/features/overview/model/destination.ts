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
        'handover.openId': data.firstId[key] ?? null,
      };
    case 'openIncidents':
    case 'safetyIncidents':
    case 'slaBreached':
      return {
        'incidents.scope': 'open',
        'incidents.period': 'all',
        'incidents.siteId': selection.siteId ?? '',
        'search.incidents': '',
        'incidents.openId': data.firstId[key] ?? null,
      };
    case 'requestsForMe':
    case 'overdueRequests':
    case 'overtimePending':
      return {
        'requests.scope': 'inbox',
        'search.requests': '',
        'search.requests-overtime': '',
        'requests.openId': data.firstId[key] ?? null,
      };
    case 'onShift':
    case 'inDowntime':
    case 'closedNoChecklist':
      return {
        'operations.scope': key === 'closedNoChecklist' ? 'ALL' : 'OPEN',
        'operations.day': data.firstDate[key] ?? '',
        'operations.siteId': selection.siteId ?? '',
        'operations.orgUnitId': selection.orgUnitId ?? '',
        'operations.group': key === 'inDowntime' ? 'DOWNTIME' : 'ALL',
        'search.operations': '',
        'operations.openId': data.firstId[key] ?? null,
      };
    case 'unlinkedEmployees':
      return {
        'employees.status': 'ACTIVE',
        'employees.telegram': 'NOT_LINKED',
        'search.employees': '',
        'employees.openId': null,
      };
    case 'unpairedTerminals':
      return { 'search.terminals': '', 'terminals.openId': null };
    case 'unscheduled':
      return {};
  }
}
