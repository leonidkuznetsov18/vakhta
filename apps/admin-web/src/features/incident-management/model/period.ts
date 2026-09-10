import { calendarPeriod } from '@vakhta/domain';
import { orderedRange } from '@/shared/lib/calendar-range';
export type PeriodMode = 'all' | 'day' | 'month' | 'year';
/** No range by default: old open incidents must stay visible. */
export function incidentPeriod(
  mode: PeriodMode,
  date: string,
  timezone: string,
  endDate: string = date,
): { from?: string; to?: string } {
  if (mode === 'all') return {};
  const range = orderedRange(date, endDate);
  return {
    from: calendarPeriod(range.from, mode, timezone).from,
    to: calendarPeriod(range.to, mode, timezone).to,
  };
}
