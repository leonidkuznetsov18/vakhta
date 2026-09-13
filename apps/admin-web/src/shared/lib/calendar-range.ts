export type CalendarUnit = 'day' | 'month' | 'year';
export function orderedRange(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}
export function unitDate(date: string, unit: CalendarUnit): string {
  return unit === 'year'
    ? `${date.slice(0, 4)}-01-01`
    : unit === 'month'
      ? `${date.slice(0, 7)}-01`
      : date;
}
