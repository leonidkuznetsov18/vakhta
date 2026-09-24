import { describe, expect, it } from 'vitest';
import type { CalendarItem, MaintenanceCalendarView } from '@vakhta/contracts';
import { MaterialsReadiness, WorkStatus, WorkType } from '@vakhta/domain';
import {
  CalendarView,
  EntryTone,
  StatusFilter,
  entriesByDay,
  filterEntries,
  gridRange,
  monthGrid,
  shiftMonth,
  shiftWeek,
  viewDays,
  weekStart,
} from './month-grid';

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    workOrderId: crypto.randomUUID(),
    number: 1001,
    type: WorkType.PLANNED_MAINTENANCE,
    date: '2026-09-30',
    dueOn: '2026-09-30',
    equipmentCode: 'M-01',
    equipmentName: 'Cup machine',
    title: 'Weekly',
    assignee: 'Mechanic',
    status: WorkStatus.ASSIGNED,
    overdue: false,
    readiness: MaterialsReadiness.UNKNOWN,
    ...overrides,
  };
}

describe('maintenance calendar month', () => {
  it('covers whole weeks from Monday to Sunday', () => {
    const days = monthGrid('2026-09');
    expect(days).toHaveLength(35);
    expect(days[0]).toEqual({ date: '2026-08-31', inMonth: false });
    expect(days.at(-1)).toEqual({ date: '2026-10-04', inMonth: false });
    expect(gridRange('2026-02')).toEqual({ from: '2026-01-26', to: '2026-03-01' });
  });

  it('moves across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('orders a day by urgency, then machine and title', () => {
    const view: MaintenanceCalendarView = {
      today: '2026-09-24',
      items: [
        item({ equipmentCode: 'M-02', title: 'Monthly', readiness: MaterialsReadiness.MISSING }),
        item({ equipmentCode: 'M-01', title: 'Weekly' }),
        item({ equipmentCode: 'M-03', type: WorkType.EMERGENCY_REPAIR, title: 'Jam' }),
      ],
      forecast: [
        { planId: crypto.randomUUID(), date: '2026-09-30', equipmentCode: 'M-01', title: 'Oil' },
      ],
      overdue: [],
    };
    const tones = entriesByDay(view, 'uk')
      .get('2026-09-30')
      ?.map((entry) => entry.tone);
    expect(tones).toEqual([
      EntryTone.EMERGENCY,
      EntryTone.MISSING,
      EntryTone.PLANNED,
      EntryTone.FORECAST,
    ]);
  });

  it('shows one week from Monday and moves by weeks', () => {
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
    expect(shiftWeek('2026-09-24', 1)).toBe('2026-09-28');
    const week = viewDays(CalendarView.WEEK, { month: '2026-09', weekOf: '2026-10-01' });
    expect(week.map((day) => day.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(week.every((day) => day.inMonth)).toBe(true);
  });

  it('filters by status and drops the forecast outside "all"', () => {
    const view: MaintenanceCalendarView = {
      today: '2026-09-24',
      items: [
        item({ date: '2026-09-10', status: WorkStatus.COMPLETED }),
        item({ date: '2026-09-20', overdue: true }),
        item({ date: '2026-09-30' }),
      ],
      forecast: [
        { planId: crypto.randomUUID(), date: '2026-09-30', equipmentCode: 'M-01', title: 'Oil' },
      ],
      overdue: [],
    };
    const byDay = entriesByDay(view, 'uk');
    const days = (filter: StatusFilter) => [...filterEntries(byDay, filter).keys()].sort();
    expect(days(StatusFilter.ALL)).toEqual(['2026-09-10', '2026-09-20', '2026-09-30']);
    expect(days(StatusFilter.OPEN)).toEqual(['2026-09-20', '2026-09-30']);
    expect(days(StatusFilter.OVERDUE)).toEqual(['2026-09-20']);
    expect(days(StatusFilter.DONE)).toEqual(['2026-09-10']);
    expect(filterEntries(byDay, StatusFilter.OPEN).get('2026-09-30')).toHaveLength(1);
  });
});
