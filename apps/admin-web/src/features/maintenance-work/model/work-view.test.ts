import { describe, expect, it } from 'vitest';
import type { WorkDetail, WorkRow } from '@vakhta/contracts';
import { EquipmentState, WorkStatus, WorkType } from '@vakhta/domain';
import { ReleaseState, RowStatusKind, releaseState, rowStatus } from './work-view';

const NOW = new Date('2026-09-24T10:00:00Z');

function row(overrides: Partial<WorkRow>): WorkRow {
  return {
    id: crypto.randomUUID(),
    number: 1008,
    type: WorkType.EMERGENCY_REPAIR,
    priority: 'P1',
    status: WorkStatus.ASSIGNED,
    title: 'Jam',
    equipment: { id: crypto.randomUUID(), code: 'M-02', name: 'Cup machine' },
    assignee: { id: crypto.randomUUID(), fullName: 'Mechanic' },
    dueOn: null,
    plannedOn: null,
    overdue: false,
    readiness: 'UNKNOWN',
    reportedAt: '2026-09-24T09:55:00Z',
    ackDueAt: '2026-09-24T10:03:00Z',
    acceptedAt: null,
    ...overrides,
  };
}

describe('maintenance work view', () => {
  it('counts down an unaccepted repair, then shows the plain status', () => {
    expect(rowStatus(row({}), NOW)).toEqual({ kind: RowStatusKind.NOT_ACCEPTED, minutesLeft: 3 });
    expect(rowStatus(row({ acceptedAt: '2026-09-24T09:58:00Z' }), NOW)).toEqual({
      kind: RowStatusKind.STATUS,
      status: WorkStatus.ASSIGNED,
    });
  });

  it('offers the release only for a finished repair of a machine out of service', () => {
    const repair = {
      ...row({ status: WorkStatus.IN_PROGRESS }),
      equipmentState: EquipmentState.STOPPED,
      stop: { startedAt: '2026-09-24T09:55:00Z', releasedAt: null },
    } as unknown as WorkDetail;
    expect(releaseState(repair)).toBe(ReleaseState.WAITING_REPAIR);
    expect(releaseState({ ...repair, status: WorkStatus.COMPLETED })).toBe(ReleaseState.READY);
    const running = {
      ...repair,
      status: WorkStatus.COMPLETED,
      equipmentState: EquipmentState.AVAILABLE,
      stop: null,
    };
    expect(releaseState(running)).toBe(ReleaseState.HIDDEN);
  });
});
