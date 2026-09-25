import { describe, expect, it } from 'vitest';
import type {
  MaintenanceOverview,
  MaintenanceOverviewWork,
  OverviewSnapshot,
} from '@vakhta/contracts';
import { buildAttention } from './attention';
import { stoppedByZone } from './equipment';
import { buildActionQueue, composition, setupItems } from './priority';
import {
  OverviewWorkBucket,
  ShiftPeriod,
  WorkPriority,
  WorkStatus,
  WorkType,
} from '@vakhta/domain';

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
  contexts: [],
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
      presentPeople: [],
      missingPeople: [],
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
      contexts: [],
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

  it('hides shift health and zones on a day off with nobody planned or recorded', () => {
    const window = (staffed: boolean) => ({
      templateId: 't',
      code: 'NIGHT',
      name: 'Night',
      period: ShiftPeriod.NIGHT,
      businessDate: '2026-09-13',
      startsAt: '2026-09-13T17:00:00Z',
      endsAt: '2026-09-14T05:00:00Z',
      closesAt: '2026-09-14T07:00:00Z',
      staffed,
    });
    const dayOff = {
      contexts: [
        {
          siteId: 's',
          siteName: 'Plant',
          timezone: 'Europe/Kyiv',
          current: window(false),
          closingPrevious: window(false),
          next: window(false),
        },
      ],
      staffing: { planned: 0, present: 0 },
      timeToAction: { reported: 0 },
      downtime: { zoneMinutes: 0, incidents: 0 },
      handover: { decided: 0, pending: 0 },
      zones: [{ status: 'IDLE' }, { status: 'IDLE' }],
      terminals: [],
      setup: null,
    } as unknown as OverviewSnapshot;
    expect(composition(all, dayOff)).toMatchObject({ health: false, zones: false });
    const running = {
      ...dayOff,
      contexts: [{ ...dayOff.contexts[0]!, current: window(true) }],
    } as OverviewSnapshot;
    expect(composition(all, running)).toMatchObject({ health: true });
    const incident = { ...dayOff, timeToAction: { reported: 1 } } as unknown as OverviewSnapshot;
    expect(composition(all, incident).health).toBe(true);
  });
});

describe('equipment cards (owner request 2026-09-25)', () => {
  const work = (over: Partial<MaintenanceOverviewWork>): MaintenanceOverviewWork => ({
    id: 'w',
    number: 1001,
    type: WorkType.PLANNED_MAINTENANCE,
    priority: WorkPriority.P3,
    status: WorkStatus.ASSIGNED,
    bucket: OverviewWorkBucket.UPCOMING,
    equipment: { id: 'm1', code: 'FB-100', name: 'Cup machine' },
    siteId: 's',
    orgUnitId: 'u',
    zoneId: 'z',
    location: 'Shop · Lathe 2',
    dueOn: '2026-09-15',
    plannedOn: '2026-09-15',
    reportedAt: null,
    ackDueAt: null,
    acceptedAt: null,
    escalatedAt: null,
    submittedAt: null,
    requiresStop: false,
    ...over,
  });
  const repair = work({
    id: 'repair',
    type: WorkType.EMERGENCY_REPAIR,
    priority: WorkPriority.P2,
    bucket: OverviewWorkBucket.EMERGENCY,
    equipment: { id: 'm2', code: 'FB-200', name: 'Packer' },
    reportedAt: '2026-09-13T08:50:00Z',
    ackDueAt: '2026-09-13T09:20:00Z',
  });
  const data: MaintenanceOverview = {
    horizonDays: 7,
    works: [
      repair,
      work({ id: 'late', bucket: OverviewWorkBucket.OVERDUE, dueOn: '2026-09-10' }),
      work({
        id: 'review',
        bucket: OverviewWorkBucket.REVIEW,
        submittedAt: '2026-09-13T07:00:00Z',
      }),
      work({ id: 'soon', plannedOn: '2026-09-16' }),
      work({ id: 'sooner', plannedOn: '2026-09-14' }),
    ],
    stopped: [],
  };
  const reader = { read: true, review: false };
  const chief = { read: true, review: true };
  const queue = (equipment: MaintenanceOverview | undefined, access = reader) =>
    buildActionQueue({
      attention: buildAttention(
        {
          shifts: null,
          incidents: null,
          handovers: null,
          requests: null,
          overtime: null,
          employees: null,
          org: null,
        },
        now,
      ),
      permissions: {
        shifts: false,
        incidents: false,
        handovers: false,
        requests: false,
        overtime: false,
      },
      snapshot: undefined,
      snapshotEnabled: false,
      equipment,
      equipmentAccess: access,
      now,
    });

  it('lists repairs, overdue and approaching maintenance with the record each opens', () => {
    const { items } = queue(data);
    expect(items.map((i) => [i.key, i.tier, i.count, i.openId])).toEqual([
      ['maintenanceEmergency', 'warning', 1, 'repair'],
      ['maintenanceOverdue', 'warning', 1, 'late'],
      ['maintenanceUpcoming', 'info', 2, 'sooner'],
    ]);
    expect(items[0]).toMatchObject({ deadlineAt: '2026-09-13T09:20:00Z', people: [{ id: 'm2' }] });
    expect(items[1]).toMatchObject({ ageKind: 'overdueSince', dayOn: '2026-09-10' });
    expect(items[2]).toMatchObject({
      ageKind: 'nearestOn',
      dayOn: '2026-09-14',
      people: [{ id: 'm1' }],
    });
  });

  it('shows the review queue only to those who review', () => {
    expect(queue(data).items.map((i) => i.key)).not.toContain('maintenanceReview');
    expect(queue(data, chief).items.map((i) => i.key)).toContain('maintenanceReview');
  });

  it('turns a repair past its acceptance deadline critical', () => {
    const late = {
      ...data,
      works: [{ ...repair, ackDueAt: '2026-09-13T08:59:00Z' }],
    };
    expect(queue(late).items[0]).toMatchObject({ key: 'maintenanceEmergency', tier: 'critical' });
  });

  it('names empty sources checked and a missing source unknown, never all clear', () => {
    expect(queue({ ...data, works: [] }).checked).toEqual([
      'maintenanceEmergency',
      'maintenanceOverdue',
      'maintenanceUpcoming',
    ]);
    expect(queue(undefined).unknown).toEqual([
      'maintenanceEmergency',
      'maintenanceOverdue',
      'maintenanceUpcoming',
    ]);
    expect(queue(undefined, { read: false, review: false })).toEqual({
      items: [],
      checked: [],
      unknown: [],
    });
  });

  it('marks stopped machines on their zones', () => {
    const machine = {
      id: 'm2',
      code: 'FB-200',
      name: 'Packer',
      siteId: 's',
      orgUnitId: 'u',
      location: 'Shop',
      since: '2026-09-13T08:50:00Z',
    };
    const byZone = stoppedByZone({
      ...data,
      stopped: [
        { ...machine, zoneId: 'z' },
        { ...machine, id: 'm3', zoneId: null },
      ],
    });
    expect([...byZone]).toEqual([['z', ['FB-200 Packer']]]);
  });
});
