import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceCalendar } from './resource-calendar';
import type { CalendarViewModel } from './model';

afterEach(cleanup);

function renderCalendar(count: number) {
  const date = '2026-09-10';
  const model: CalendarViewModel = {
    label: 'Schedule',
    resourceLabel: 'Zone',
    emptyLabel: 'No assignments',
    moreItemsLabel: '{count} more',
    dates: [date, '2026-09-11'].map((id) => ({ id, label: id, shortLabel: id.slice(8) })),
    resources: [
      {
        id: 'zone',
        title: 'Line 1',
        description: '',
        cells: [
          {
            date,
            label: date,
            summary: `Assignments: ${count}`,
            create: null,
            items: Array.from({ length: count }, (_, index) => ({
              id: `worker-${index}`,
              title: `Worker ${index + 1}`,
              time: '08:00–20:00 12 h',
              description: 'Day shift',
              status: 'Published',
              tone: 'amber',
            })),
          },
        ],
      },
    ],
  };
  const onSelect = vi.fn();
  render(
    <ResourceCalendar
      model={model}
      layout="grid"
      selectedDate={date}
      selection={null}
      onDate={vi.fn()}
      onSelect={onSelect}
      onCreate={vi.fn()}
      detail={<p>All assignments</p>}
    />,
  );
  return onSelect;
}

describe('calendar assignment visibility', () => {
  it('shows both assignments without a redundant total button in a week cell', () => {
    renderCalendar(2);
    expect(screen.getByRole('button', { name: /^Worker 1,/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Worker 2,/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Assignments:|more/ })).toBeNull();
  });

  it('counts only hidden assignments and opens the complete cell', () => {
    const onSelect = renderCalendar(5);
    expect(screen.getAllByRole('button', { name: /^Worker/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '2 more' }));
    expect(onSelect).toHaveBeenCalledWith({ resourceId: 'zone', date: '2026-09-10' });
  });
});
