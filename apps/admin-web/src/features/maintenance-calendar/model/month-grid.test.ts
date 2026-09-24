import { describe, expect, it } from 'vitest';
import type { CalendarItem, MaintenanceCalendarView } from '@vakhta/contracts';
import { MaterialsReadiness, WorkStatus, WorkType } from '@vakhta/domain';
import { EntryTone, entriesByDay, gridRange, monthGrid, shiftMonth } from './month-grid';

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
});
