import { calendarPeriod } from '@vakhta/domain';
export type PeriodMode = 'all' | 'day' | 'month' | 'year';
/** No range by default: old open incidents must stay visible. */
export function incidentPeriod(
  mode: PeriodMode,
  date: string,
  timezone: string,
): { from?: string; to?: string } {
  return mode === 'all' ? {} : calendarPeriod(date, mode, timezone);
}
