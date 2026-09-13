import { describe, expect, it } from 'vitest';
import { downtimeSnapshot } from './downtime.js';
import { handoverAcceptance } from './handover-acceptance.js';
import { staffingSnapshot, type PlannedAssignment } from './staffing.js';
import { offlineTerminalIsCritical, terminalConnectivity } from './terminal-connectivity.js';
import { timeToAction } from './time-to-action.js';
import { sortZones, zoneStatus } from './zone-status.js';

const at = (hhmm: string) => new Date(`2026-09-13T${hhmm}:00Z`);

describe('staffing (spec 004 D-03, AC-014)', () => {
  it('40 present of 43 planned, 2 not arrived, 1 expected, 1 unscheduled', () => {
    const planned: PlannedAssignment[] = Array.from({ length: 43 }, (_, i) => ({
      assignmentId: `a${i}`,
      employeeId: `e${i}`,
      planStartAt: i === 42 ? at('12:00') : at('08:00'),
      planEndAt: at('20:00'),
    }));
    const arrivals = [
      ...Array.from({ length: 40 }, (_, i) => ({
        employeeId: `e${i}`,
        assignmentId: i % 2 ? `a${i}` : null,
      })),
      { employeeId: 'x', assignmentId: null },
    ];
    const s = staffingSnapshot(planned, arrivals, at('09:45'), 10);
    expect(s).toMatchObject({
      planned: 43,
      present: 40,
      notArrived: 2,
      expected: 1,
      unscheduled: 1,
    });
    expect(s.notArrivedEmployeeIds).toEqual(['e40', 'e41']);
    expect(s.unscheduledEmployeeIds).toEqual(['x']);
    expect(s.oldestNotArrivedSince).toEqual(at('08:00'));
  });

  it('within the late grace a planned person is still expected', () => {
    const s = staffingSnapshot(
      [{ assignmentId: 'a', employeeId: 'e', planStartAt: at('08:00'), planEndAt: at('20:00') }],
      [],
      at('08:09'),
      10,
    );
    expect(s).toMatchObject({ present: 0, notArrived: 0, expected: 1 });
  });

  it('AC-018: no plan is zero planned, not a percentage', () => {
    expect(staffingSnapshot([], [], at('09:00'), 10)).toMatchObject({ planned: 0, present: 0 });
  });
});

describe('downtime in zone-minutes (spec 004 D-05, AC-015)', () => {
  it('two people in one zone count once; person-minutes keep both', () => {
    const s = downtimeSnapshot(
      [
        {
          employeeId: 'p1',
          zoneId: 'A',
          reasonCode: 'AIR',
          startedAt: at('10:00'),
          endedAt: at('10:30'),
        },
        {
          employeeId: 'p2',
          zoneId: 'A',
          reasonCode: 'AIR',
          startedAt: at('10:00'),
          endedAt: at('10:30'),
        },
        {
          employeeId: 'p3',
          zoneId: 'B',
          reasonCode: 'NO_MATERIAL',
          startedAt: at('11:30'),
          endedAt: null,
        },
      ],
      at('08:00'),
      at('11:45'),
    );
    expect(s.zoneMinutes).toBe(45);
    expect(s.personMinutes).toBe(75);
    expect(s.byZone).toEqual([
      { zoneId: 'A', minutes: 30 },
      { zoneId: 'B', minutes: 15 },
    ]);
    expect(s.topReason).toEqual({ code: 'AIR', minutes: 30 });
  });

  it('clips intervals to the window and never merges people without a zone', () => {
    const s = downtimeSnapshot(
      [
        {
          employeeId: 'p1',
          zoneId: null,
          reasonCode: null,
          startedAt: at('07:00'),
          endedAt: at('08:30'),
        },
        {
          employeeId: 'p2',
          zoneId: null,
          reasonCode: null,
          startedAt: at('08:00'),
          endedAt: at('08:30'),
        },
      ],
      at('08:00'),
      at('12:00'),
    );
    expect(s).toMatchObject({ zoneMinutes: 60, personMinutes: 60 });
    expect(s.byZone).toEqual([{ zoneId: null, minutes: 60 }]);
  });
});

describe('time to action (spec 004 D-06, AC-016)', () => {
  it('median of reactions, SLA met and the unacknowledged shown as awaiting', () => {
    const inc = (open: string, ack: string | null, due: string, status = 'ACKNOWLEDGED') => ({
      status,
      openedAt: at(open),
      slaDueAt: at(due),
      acknowledgedAt: ack ? at(ack) : null,
      resolvedAt: null,
    });
    const s = timeToAction(
      [
        inc('09:00', '09:02', '09:30'),
        inc('09:10', '09:14', '09:40'),
        inc('09:20', '09:32', '09:25'),
        inc('10:00', null, '10:30', 'REPORTED'),
        inc('10:05', null, '10:06', 'DUPLICATE'),
      ],
      at('10:40'),
    );
    expect(s).toEqual({
      reported: 4,
      acknowledged: 3,
      medianMinutes: 4,
      slaMet: 2,
      slaMissed: 2,
      awaiting: 1,
      awaitingBreached: 1,
    });
  });

  it('no incidents: no median', () => {
    expect(timeToAction([], at('10:00')).medianMinutes).toBeNull();
  });
});

describe('handover acceptance (spec 004 D-07, AC-017)', () => {
  it('49 of 50 decided accepted without dispute, 3 pending', () => {
    const records = [
      ...Array.from({ length: 48 }, () => ({ status: 'ACCEPTED', disputed: false })),
      { status: 'RESOLVED_ACCEPTED', disputed: false },
      { status: 'RESOLVED_NO_FAULT', disputed: true },
      ...Array.from({ length: 3 }, () => ({ status: 'SUBMITTED', disputed: false })),
      { status: 'DRAFT', disputed: false },
      { status: 'SUPERSEDED', disputed: false },
    ];
    expect(handoverAcceptance(records)).toEqual({
      clean: 49,
      decided: 50,
      disputed: 1,
      pending: 3,
    });
  });
});

describe('terminal connectivity (spec 004 D-04, AC-020–AC-021)', () => {
  const now = at('12:00');
  it('offline after three missed 45 s renewals', () => {
    const t = (seenAt: string | null) => ({
      status: 'ACTIVE',
      paired: true,
      lastSeenAt: seenAt ? new Date(seenAt) : null,
    });
    expect(terminalConnectivity(t('2026-09-13T11:54:00Z'), now, 45)).toBe('OFFLINE');
    expect(terminalConnectivity(t('2026-09-13T11:59:00Z'), now, 45)).toBe('ONLINE');
    expect(terminalConnectivity(t('2026-09-13T11:57:45Z'), now, 45)).toBe('ONLINE');
    expect(terminalConnectivity(t('2026-09-13T11:57:44Z'), now, 45)).toBe('OFFLINE');
    expect(terminalConnectivity(t(null), now, 45)).toBe('OFFLINE');
  });
  it('AC-021: disabled and unpaired terminals are never offline', () => {
    expect(
      terminalConnectivity({ status: 'DISABLED', paired: true, lastSeenAt: null }, now, 45),
    ).toBe('DISABLED');
    expect(
      terminalConnectivity({ status: 'ACTIVE', paired: false, lastSeenAt: null }, now, 45),
    ).toBe('UNPAIRED');
  });
  it('critical near a shift boundary or with people not recorded', () => {
    expect(offlineTerminalIsCritical({ now, nextBoundaryAt: at('12:50'), notArrived: 0 })).toBe(
      true,
    );
    expect(offlineTerminalIsCritical({ now, nextBoundaryAt: at('14:00'), notArrived: 0 })).toBe(
      false,
    );
    expect(offlineTerminalIsCritical({ now, nextBoundaryAt: null, notArrived: 2 })).toBe(true);
  });
});

describe('zone status (spec 004 AC-022)', () => {
  it('problem zones sort first with their evidence', () => {
    const zones = [
      zoneStatus({ zoneId: 'idle', planned: 0, openStates: [], downtimeSince: null }),
      zoneStatus({
        zoneId: 'ok',
        planned: 2,
        openStates: ['WORKING', 'BREAK'],
        downtimeSince: null,
      }),
      zoneStatus({ zoneId: 'empty', planned: 1, openStates: [], downtimeSince: null }),
      zoneStatus({
        zoneId: 'stop',
        planned: 2,
        openStates: ['DOWNTIME', 'DOWNTIME'],
        downtimeSince: at('11:13'),
      }),
      zoneStatus({ zoneId: 'short', planned: 3, openStates: ['WORKING'], downtimeSince: null }),
      zoneStatus({ zoneId: 'closing', planned: 1, openStates: ['CLEANING'], downtimeSince: null }),
    ];
    expect(sortZones(zones).map((z) => `${z.zoneId}:${z.status}`)).toEqual([
      'stop:DOWNTIME',
      'empty:UNSTAFFED',
      'short:UNDERSTAFFED',
      'closing:CLOSING',
      'ok:WORKING',
      'idle:IDLE',
    ]);
    expect(zones[3]).toMatchObject({ present: 2, planned: 2, since: at('11:13') });
  });
});
