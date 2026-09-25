import { describe, expect, it } from 'vitest';
import { WorkPriority, WorkStatus, WorkType } from './codes.js';
import {
  OverviewWorkBucket,
  UPCOMING_MAINTENANCE_DAYS,
  emergencyIsCritical,
  overviewWorkBucket,
  upcomingHorizonDays,
} from './overview.js';

const TODAY = '2026-09-25';
const planned = (over: Partial<Parameters<typeof overviewWorkBucket>[0]> = {}) => ({
  type: WorkType.PLANNED_MAINTENANCE,
  status: WorkStatus.ASSIGNED,
  dueOn: '2026-09-28',
  plannedOn: '2026-09-28',
  ...over,
});

describe('overview work bucket', () => {
  it('puts every open emergency first, whatever its dates', () => {
    const repair = {
      type: WorkType.EMERGENCY_REPAIR,
      status: WorkStatus.WAITING,
      dueOn: null,
      plannedOn: null,
    };
    expect(overviewWorkBucket(repair, TODAY, 7)).toBe(OverviewWorkBucket.EMERGENCY);
  });

  it('drops closed work', () => {
    expect(overviewWorkBucket(planned({ status: WorkStatus.COMPLETED }), TODAY, 7)).toBeNull();
    expect(overviewWorkBucket(planned({ status: WorkStatus.CANCELLED }), TODAY, 7)).toBeNull();
  });

  it('keeps submitted work in review even past its due date', () => {
    const late = planned({
      status: WorkStatus.IN_REVIEW,
      dueOn: '2026-09-20',
      plannedOn: '2026-09-20',
    });
    expect(overviewWorkBucket(late, TODAY, 7)).toBe(OverviewWorkBucket.REVIEW);
  });

  it('marks work overdue only after its due date', () => {
    expect(
      overviewWorkBucket(planned({ dueOn: '2026-09-24', plannedOn: '2026-09-24' }), TODAY, 7),
    ).toBe(OverviewWorkBucket.OVERDUE);
    expect(overviewWorkBucket(planned({ dueOn: TODAY, plannedOn: TODAY }), TODAY, 7)).toBe(
      OverviewWorkBucket.TODAY,
    );
  });

  it('counts work moved to an earlier day but not yet due as today', () => {
    expect(
      overviewWorkBucket(planned({ dueOn: '2026-09-30', plannedOn: '2026-09-23' }), TODAY, 7),
    ).toBe(OverviewWorkBucket.TODAY);
  });

  it('lists work within the horizon as upcoming and ignores later work', () => {
    expect(
      overviewWorkBucket(planned({ plannedOn: '2026-10-02', dueOn: '2026-10-02' }), TODAY, 7),
    ).toBe(OverviewWorkBucket.UPCOMING);
    expect(
      overviewWorkBucket(planned({ plannedOn: '2026-10-03', dueOn: '2026-10-03' }), TODAY, 7),
    ).toBeNull();
  });
});

describe('upcoming horizon', () => {
  it('follows the earliest reminder', () => {
    expect(upcomingHorizonDays([7, 3, 1])).toBe(7);
    expect(upcomingHorizonDays([14, 2])).toBe(14);
    expect(upcomingHorizonDays([])).toBe(UPCOMING_MAINTENANCE_DAYS);
  });
});

describe('emergency urgency', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  const fault = {
    priority: WorkPriority.P2,
    acceptedAt: null,
    ackDueAt: '2026-09-25T10:20:00Z',
    escalatedAt: null,
  };

  it('is critical for danger and a stopped machine', () => {
    expect(emergencyIsCritical({ ...fault, priority: WorkPriority.P0 }, now)).toBe(true);
    expect(emergencyIsCritical({ ...fault, priority: WorkPriority.P1 }, now)).toBe(true);
  });

  it('is attention for a fault the mechanic may still accept in time', () => {
    expect(emergencyIsCritical(fault, now)).toBe(false);
    expect(
      emergencyIsCritical(
        { ...fault, acceptedAt: '2026-09-25T09:55:00Z', ackDueAt: '2026-09-25T09:00:00Z' },
        now,
      ),
    ).toBe(false);
  });

  it('becomes critical when acceptance is late or the repair escalated', () => {
    expect(emergencyIsCritical({ ...fault, ackDueAt: '2026-09-25T09:59:00Z' }, now)).toBe(true);
    expect(emergencyIsCritical({ ...fault, escalatedAt: '2026-09-25T09:50:00Z' }, now)).toBe(true);
  });
});
