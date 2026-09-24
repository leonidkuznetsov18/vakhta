import { describe, expect, it } from 'vitest';
import type { ActiveShiftView, OverviewPlannedPerson, OverviewStaffing } from '@vakhta/contracts';
import {
  OperationsRowKind,
  StateGroup,
  groupCounts,
  notArrivedApplies,
  operationsRows,
  visibleRows,
} from './rows';

function shift(employeeId: string, state: ActiveShiftView['state']): ActiveShiftView {
  return {
    id: `s-${employeeId}`,
    employeeId,
    assignmentId: null,
    businessDate: '2026-09-07',
    state,
    resumeState: null,
    version: 1,
    startedAt: '2026-09-07T05:00:00.000Z',
    endedAt: null,
    stateSince: '2026-09-07T05:00:00.000Z',
    planStartAt: null,
    planEndAt: null,
    zoneId: null,
    zoneName: null,
    zoneAccepted: true,
    needsClarification: false,
    clarificationReason: null,
    autoCloseReason: null,
    fullName: employeeId,
    personnelNumber: employeeId,
    orgUnitId: null,
    orgUnitName: null,
    presenceSince: null,
    stateMinutes: 0,
  };
}

const person = (employeeId: string): OverviewPlannedPerson => ({
  employeeId,
  fullName: employeeId,
  personnelNumber: employeeId,
  orgUnitName: 'Unit',
  planStartAt: '2026-09-07T05:00:00.000Z',
  planEndAt: '2026-09-07T17:00:00.000Z',
  zoneName: null,
});

describe('operations rows', () => {
  it('adds each missing person once, after the shifts, unless a shift row already names them', () => {
    const rows = operationsRows(
      [shift('a', 'WORKING')],
      [person('a'), person('b'), person('b')],
      '2026-09-07T05:45:30.000Z',
    );
    expect(rows.map((r) => `${r.kind}:${r.key}`)).toEqual([
      `${OperationsRowKind.SHIFT}:s-a`,
      `${OperationsRowKind.NOT_ARRIVED}:not-arrived:b`,
    ]);
    expect(rows[1]).toMatchObject({ lateMinutes: 45 });
  });

  it('keeps a missing person listed when their only shift row is already closed', () => {
    const closed = { ...shift('a', 'SHIFT_CLOSED'), endedAt: '2026-09-07T04:00:00.000Z' };
    const rows = operationsRows([closed], [person('a')], '2026-09-07T06:00:00.000Z');
    expect(rows.map((r) => r.key)).toEqual(['s-a', 'not-arrived:a']);
  });

  it('counts the missing as their own group and puts them after downtime, before normal work', () => {
    const rows = operationsRows(
      [shift('a', 'WORKING'), shift('c', 'DOWNTIME')],
      [person('b')],
      '2026-09-07T06:00:00.000Z',
    );
    expect(groupCounts(rows)).toMatchObject({ ALL: 3, NOT_ARRIVED: 1, WORKING: 1, DOWNTIME: 1 });
    expect(visibleRows(rows, StateGroup.ALL).map((r) => r.key)).toEqual([
      's-c',
      'not-arrived:b',
      's-a',
    ]);
    expect(visibleRows(rows, StateGroup.NOT_ARRIVED).map((r) => r.key)).toEqual(['not-arrived:b']);
  });

  it('applies the no-shows only to the business day of the current shift and not to closed lists', () => {
    const staffing: OverviewStaffing = {
      planned: 0,
      present: 0,
      notArrived: 0,
      expected: 0,
      unscheduled: 0,
      presentPeople: [],
      expectedPeople: [],
      notArrivedPeople: [],
      unscheduledPeople: [],
      oldestNotArrivedSince: null,
      businessDate: '2026-09-07',
    };
    expect(notArrivedApplies(staffing, '2026-09-07', 'OPEN')).toBe(true);
    expect(notArrivedApplies(staffing, '2026-09-07', 'ALL')).toBe(true);
    expect(notArrivedApplies(staffing, '2026-09-07', 'CLOSED')).toBe(false);
    expect(notArrivedApplies(staffing, '2026-09-06', 'OPEN')).toBe(false);
    expect(notArrivedApplies(null, '2026-09-07', 'OPEN')).toBe(false);
  });
});
