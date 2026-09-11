import { endOfMonth, endOfYear, format, parseISO } from 'date-fns';
import { calendarPeriod } from '@vakhta/domain';
import { orderedRange, unitDate } from '@/shared/lib/calendar-range';
export type PeriodMode = 'all' | 'day' | 'month' | 'year' | 'range';

/** Expand persisted legacy month/year selections into the dates shown in the two fields. */
export function incidentDates(mode: PeriodMode, date: string, endDate: string) {
  if (mode === 'all') return { from: '', to: '' };
  if (mode === 'range') return { from: date, to: endDate };
  const range = orderedRange(date, endDate);
  const end = parseISO(range.to);
  return {
    from: unitDate(range.from, mode),
    to:
      mode === 'day'
        ? range.to
        : format(mode === 'month' ? endOfMonth(end) : endOfYear(end), 'yyyy-MM-dd'),
  };
}

/** Empty bounds mean unrestricted; the final selected day is included in the site's timezone. */
export function incidentPeriod(
  mode: PeriodMode,
  date: string,
  timezone: string,
  endDate: string = date,
): { from?: string; to?: string } {
  const range = incidentDates(mode, date, endDate);
  return {
    ...(range.from ? { from: calendarPeriod(range.from, 'day', timezone).from } : {}),
    ...(range.to ? { to: calendarPeriod(range.to, 'day', timezone).to } : {}),
  };
}
