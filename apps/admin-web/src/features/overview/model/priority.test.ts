import { describe, expect, it } from 'vitest';
import type { OverviewSnapshot } from '@vakhta/contracts';
import { buildAttention } from './attention';
import { buildActionQueue, composition, setupItems } from './priority';

const all = { shifts: true, incidents: true, handovers: true, requests: true, overtime: true };
const now = new Date('2026-09-13T09:00:00Z');
const attention = buildAttention(
  {
    shifts: [],
    incidents: [
      {
        id: 'late',
        status: 'REPORTED',
        acknowledgedAt: null,
        resolvedAt: null,
        slaBreached: true,
        openedAt: '2026-09-13T08:00:00Z',
        slaDueAt: '2026-09-13T08:30:00Z',
        severity: 'NORMAL',
      },
      {
        id: 'fresh',
        status: 'REPORTED',
        acknowledgedAt: null,
        resolvedAt: null,
        slaBreached: false,
        openedAt: '2026-09-13T08:55:00Z',
        slaDueAt: '2026-09-13T09:55:00Z',
        severity: 'NORMAL',
      },
    ],
    handovers: [
      {
        id: 'h',
        status: 'SUBMITTED',
        submittedByName: 'W',
        zoneName: null,
        submittedAt: '2026-09-13T06:00:00Z',
        acceptDeadlineAt: '2026-09-13T08:00:00Z',
      },
    ],
    requests: [
      {
        id: 'r',
        status: 'SUBMITTED',
        employeeName: 'E',
        overdue: false,
        submittedAt: '2026-09-12T10:00:00Z',
        stepDeadlineAt: null,
      },
    ],
    overtime: [],
    employees: null,
    org: null,
  },
  now,
);
const snapshot = {
  downtimeEscalationMinutes: 15,
  terminals: [],
  zones: [
    {
      zoneId: 'z',
      zoneName: 'Lathe 2',
      orgUnitId: 'u',
      orgUnitName: 'Shop',
      siteId: 's',
      status: 'DOWNTIME',
      planned: 1,
      present: 1,
      since: '2026-09-13T08:30:00Z',
    },
  ],
  staffing: { notArrived: 0, notArrivedPeople: [], oldestNotArrivedSince: null },
  setup: { unlinkedEmployees: 93, unpairedTerminals: 0 },
} as unknown as OverviewSnapshot;

describe('action queue priority (spec 004 D-08, AC-009–AC-012)', () => {
  it('orders tiers, then deadlines, then age; zero sources are listed as checked', () => {
    const q = buildActionQueue({
      attention,
      permissions: all,
      snapshot,
      snapshotEnabled: true,
      now,
    });
    expect(q.items.map((i) => `${i.tier}:${i.key}:${i.count}`)).toEqual([
      'critical:slaBreached:1',
      'critical:longDowntime:1',
      'warning:pendingHandovers:1',
      'warning:openIncidents:2',
      'info:requestsForMe:1',
    ]);
    expect(q.items[0]).toMatchObject({
      oldestAt: '2026-09-13T08:00:00Z',
      deadlineAt: '2026-09-13T08:30:00Z',
    });
    expect(q.checked).toEqual(
      expect.arrayContaining([
        'overdueRequests',
        'closedNoChecklist',
        'terminalsOffline',
        'notArrived',
      ]),
    );
    expect(q.unknown).toEqual([]);
  });

  it('names sources it could not read and never counts them as clear', () => {
    const failed = buildAttention(
      {
        shifts: [],
        incidents: null,
        handovers: [],
        requests: [],
        overtime: [],
        employees: null,
        org: null,
      },
      now,
    );
    const q = buildActionQueue({
      attention: failed,
      permissions: all,
      snapshot: undefined,
      snapshotEnabled: true,
      now,
    });
    expect(q.unknown).toEqual(
      expect.arrayContaining(['slaBreached', 'openIncidents', 'terminalsOffline', 'notArrived']),
    );
    expect(q.checked).not.toContain('slaBreached');
  });

  it('skips sources the role does not request and keeps setup debt out of the queue', () => {
    const q = buildActionQueue({
      attention,
      permissions: {
        shifts: false,
        incidents: false,
        handovers: false,
        requests: true,
        overtime: false,
      },
      snapshot: { ...snapshot, zones: null, terminals: null, staffing: null } as OverviewSnapshot,
      snapshotEnabled: true,
      now,
    });
    expect(q.items.map((i) => i.key)).toEqual(['requestsForMe']);
    expect(setupItems(snapshot)).toEqual([{ key: 'unlinkedEmployees', count: 93 }]);
  });

  it('composes blocks from readable sections (D-09)', () => {
    const none = {
      shifts: false,
      incidents: false,
      handovers: false,
      requests: false,
      overtime: false,
    };
    const bare = {
      terminals: null,
      staffing: null,
      zones: null,
      downtime: null,
      timeToAction: null,
      handover: null,
      setup: null,
    } as unknown as OverviewSnapshot;
    expect(composition(none, bare)).toMatchObject({
      queue: false,
      health: false,
      zones: false,
      linksOnly: true,
    });
    expect(composition(all, snapshot)).toMatchObject({
      queue: true,
      zones: true,
      setup: true,
      linksOnly: false,
    });
  });
});
