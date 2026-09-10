import { describe, expect, it } from 'vitest';
import type { ActiveShiftView } from '@vakhta/contracts';
import { buildAttention, type AttentionSources } from './attention';
import { attentionFilters } from './destination';

const now = new Date('2026-09-10T18:00:00Z');
export const emptySources: AttentionSources = {
  shifts: [],
  incidents: [],
  handovers: [],
  requests: [],
  overtime: [],
  employees: [],
  org: { terminals: [] },
};
const shift: ActiveShiftView = {
  id: 'shift',
  employeeId: 'employee',
  assignmentId: 'assignment',
  businessDate: '2026-09-09',
  state: 'WORKING',
  resumeState: null,
  version: 1,
  startedAt: '2026-09-09T17:00:00Z',
  endedAt: null,
  stateSince: '2026-09-09T17:00:00Z',
  planStartAt: null,
  planEndAt: null,
  zoneId: null,
  zoneName: null,
  zoneAccepted: true,
  needsClarification: false,
  clarificationReason: null,
  autoCloseReason: null,
  fullName: 'Worker',
  personnelNumber: '1',
  orgUnitId: null,
  orgUnitName: null,
  presenceSince: null,
  stateMinutes: 0,
};
const incident = {
  id: 'incident',
  status: 'REPORTED' as const,
  acknowledgedAt: null,
  resolvedAt: null,
  slaBreached: false,
};
const report = {
  id: 'report',
  status: 'SUBMITTED' as const,
  submittedByName: 'Worker',
  zoneName: null,
};

export const sixPending = Array.from({ length: 6 }, (_, index) => ({
  ...report,
  id: `pending-${index}`,
}));

describe('overview counter eligibility', () => {
  it('counts all six submitted checklists before the acceptance deadline, plus disputes, not completed reports', () => {
    const data = buildAttention(
      {
        ...emptySources,
        handovers: [
          ...sixPending,
          { ...report, id: 'dispute', status: 'DISPUTED' },
          { ...report, id: 'approved', status: 'RESOLVED_ACCEPTED' },
          { ...report, id: 'draft', status: 'DRAFT' },
        ],
      },
      now,
    );
    expect(data.pendingHandovers).toBe(7);
    expect(data.people.pendingHandovers).toHaveLength(7);
    expect(data.firstId.pendingHandovers).toBe('pending-0');
  });
  it('counts every open incident but only unanswered SLA breaches as work requiring reaction', () => {
    const data = buildAttention(
      {
        ...emptySources,
        incidents: [
          incident,
          { ...incident, id: 'waiting', slaBreached: true },
          {
            ...incident,
            id: 'working',
            status: 'IN_PROGRESS',
            slaBreached: true,
            acknowledgedAt: now.toISOString(),
          },
          {
            ...incident,
            id: 'resolved',
            status: 'RESOLVED',
            slaBreached: true,
            resolvedAt: now.toISOString(),
          },
        ],
      },
      now,
    );
    expect(data.openIncidents).toBe(3);
    expect(data.slaBreached).toBe(1);
    expect(data.firstId.slaBreached).toBe('waiting');
  });
  it('counts open night shifts across business dates, only active unscheduled shifts and actual downtime', () => {
    const data = buildAttention(
      {
        ...emptySources,
        shifts: [
          shift,
          { ...shift, id: 'unscheduled', assignmentId: null, state: 'DOWNTIME' },
          {
            ...shift,
            id: 'closed',
            assignmentId: null,
            state: 'SHIFT_CLOSED',
            endedAt: now.toISOString(),
            autoCloseReason: 'NO_CHECKLIST',
          },
          {
            ...shift,
            id: 'normal-close',
            state: 'SHIFT_CLOSED',
            endedAt: now.toISOString(),
            autoCloseReason: 'LEFT_OPEN',
          },
          { ...shift, id: 'inconsistent', state: 'SHIFT_CLOSED', endedAt: null },
        ],
      },
      now,
    );
    expect(data.onShift).toBe(2);
    expect(data.unscheduled).toBe(1);
    expect(data.inDowntime).toBe(1);
    expect(data.closedNoChecklist).toBe(1);
    expect(data.firstDate.onShift).toBe('2026-09-09');
    expect(data.firstId.inDowntime).toBe('unscheduled');
    expect(data.people.closedNoChecklist).toHaveLength(1);
  });
  it('counts only open inbox requests and pending overtime decisions', () => {
    const request = {
      id: 'request',
      employeeName: 'Worker',
      status: 'SUBMITTED' as const,
      overdue: false,
    };
    const overtime = {
      shiftSessionId: 'overtime',
      employeeName: 'Worker',
      status: 'PENDING' as const,
    };
    const data = buildAttention(
      {
        ...emptySources,
        requests: [
          request,
          { ...request, id: 'late', overdue: true },
          { ...request, id: 'approved', status: 'APPROVED', overdue: true },
        ],
        overtime: [
          overtime,
          { ...overtime, shiftSessionId: 'approved', status: 'APPROVED' },
          { ...overtime, shiftSessionId: 'rejected', status: 'REJECTED' },
        ],
      },
      now,
    );
    expect(data.requestsForMe).toBe(2);
    expect(data.overdueRequests).toBe(1);
    expect(data.overtimePending).toBe(1);
    expect(data.firstId.overdueRequests).toBe('late');
  });
  it('excludes inactive employees and disabled or already paired terminals', () => {
    const employee = {
      id: 'employee',
      status: 'ACTIVE' as const,
      telegramLinked: false,
      fullName: 'Worker',
      personnelNumber: '1',
    };
    const terminal = {
      id: 'terminal',
      siteId: 'site',
      name: 'Terminal',
      checkpoint: 'BOTH' as const,
      status: 'ACTIVE' as const,
      paired: false,
      lastSeenAt: null,
    };
    const data = buildAttention(
      {
        ...emptySources,
        employees: [
          employee,
          { ...employee, id: 'linked', telegramLinked: true },
          { ...employee, id: 'inactive', status: 'TERMINATED' },
        ],
        org: {
          terminals: [
            terminal,
            { ...terminal, id: 'paired', paired: true },
            { ...terminal, id: 'disabled', status: 'DISABLED' },
          ],
        },
      },
      now,
    );
    expect(data.unlinkedEmployees).toBe(1);
    expect(data.unpairedTerminals).toBe(1);
  });
  it('keeps unavailable sources unknown instead of reporting zero', () => {
    const data = buildAttention(
      {
        shifts: null,
        incidents: null,
        handovers: null,
        requests: null,
        overtime: null,
        employees: null,
        org: null,
      },
      null,
    );
    for (const key of [
      'onShift',
      'unscheduled',
      'closedNoChecklist',
      'inDowntime',
      'openIncidents',
      'slaBreached',
      'pendingHandovers',
      'requestsForMe',
      'overdueRequests',
      'overtimePending',
      'unlinkedEmployees',
      'unpairedTerminals',
    ] as const)
      expect(data[key]).toBeNull();
  });
  it('returns genuine zeros only after successful empty reads', () => {
    const data = buildAttention(emptySources, now);
    expect(data.pendingHandovers).toBe(0);
    expect(data.onShift).toBe(0);
    expect(data.requestsForMe).toBe(0);
    expect(data.refreshedAt).toEqual(now);
  });
});

describe('overview destination filters', () => {
  const data = buildAttention(
    { ...emptySources, handovers: sixPending, shifts: [{ ...shift, state: 'DOWNTIME' }] },
    now,
  );
  it('opens all pending reports without a stale date, site or search', () => {
    expect(attentionFilters('pendingHandovers', data)).toEqual({
      'handover.scope': 'pending',
      'handover.date': '',
      'handover.siteId': '',
      'search.handover': '',
      'handover.openId': 'pending-0',
    });
  });
  it.each(['slaBreached', 'openIncidents'] as const)(
    'clears old incident period filters for %s',
    (key) => {
      expect(attentionFilters(key, data)).toMatchObject({
        'incidents.scope': 'open',
        'incidents.period': 'all',
        'incidents.siteId': '',
        'search.incidents': '',
      });
    },
  );
  it('opens the counted shift business date and removes unrelated unit/group filters', () => {
    expect(attentionFilters('inDowntime', data)).toMatchObject({
      'operations.day': '2026-09-09',
      'operations.scope': 'OPEN',
      'operations.group': 'DOWNTIME',
      'operations.siteId': '',
      'operations.orgUnitId': '',
    });
    expect(attentionFilters('closedNoChecklist', data)['operations.scope']).toBe('ALL');
  });
  it.each(['requestsForMe', 'overdueRequests', 'overtimePending'] as const)(
    'resets the inbox destination for %s',
    (key) => {
      expect(attentionFilters(key, data)).toMatchObject({
        'requests.scope': 'inbox',
        'search.requests': '',
      });
    },
  );
});
