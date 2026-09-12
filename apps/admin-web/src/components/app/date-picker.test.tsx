import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField, MonthField } from './date-picker';
import { formatDate } from '@/lib/format';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

afterEach(cleanup);

describe('calendar field selection units', () => {
  it('browses another month and year before choosing a whole week', () => {
    const onChange = vi.fn();
    render(<DateField label="Week" value="2026-09-10" selection="week" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const labels = messages(currentLocale()).ui.common;
    fireEvent.change(screen.getByRole('combobox', { name: labels.calendarYear }), {
      target: { value: '2027' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: labels.calendarMonth }), {
      target: { value: '01' },
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: `${formatDate('2027-01-04')} – ${formatDate('2027-01-10')}`,
      }),
    );
    expect(onChange).toHaveBeenCalledWith('2027-01-04');
  });

  it('shows whole weeks only and commits one week in a single click', () => {
    const onChange = vi.fn();
    render(
      <DateField
        label="Week"
        value="2026-09-10"
        selection="week"
        minDate="2026-09-01"
        maxDate="2026-09-30"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.queryByRole('grid')).toBeNull();
    const selected = `${formatDate('2026-09-07')} – ${formatDate('2026-09-13')}`;
    expect(screen.getByRole('button', { name: selected }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: `${formatDate('2026-09-14')} – ${formatDate('2026-09-20')}`,
      }),
    );
    expect(onChange).toHaveBeenCalledWith('2026-09-14');
    expect(screen.queryByRole('button', { name: selected })).toBeNull();
  });

  it('shows partial boundary weeks without implying unloaded dates are included', () => {
    render(
      <DateField
        label="Week"
        value="2026-09-01"
        selection="week"
        minDate="2026-09-01"
        maxDate="2026-09-30"
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(
      screen.getByRole('button', {
        name: `${formatDate('2026-09-01')} – ${formatDate('2026-09-06')}`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: `${formatDate('2026-09-28')} – ${formatDate('2026-09-30')}`,
      }),
    ).toBeTruthy();
  });

  it('retains a day grid for individual dates', () => {
    render(<DateField label="Day" value="2026-09-10" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getByRole('option', { name: '2027' })).toBeTruthy();
  });

  it('selects a month and year without day cells', () => {
    const onChange = vi.fn();
    render(<MonthField label="Month" value="2026-09" picker="months" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.queryByRole('grid')).toBeNull();
    fireEvent.change(
      screen.getByRole('combobox', { name: messages(currentLocale()).ui.common.calendarYear }),
      { target: { value: '2027' } },
    );
    const month = new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(
      new Date(2000, 0, 1),
    );
    fireEvent.click(screen.getByRole('button', { name: month }));
    expect(onChange).toHaveBeenCalledWith('2027-01');
  });
});
