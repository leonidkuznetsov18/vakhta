/** Calendar arithmetic on business dates; never browser-local instants. */
export function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function adjacentMonth(month: string, offset: number): string {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

export function calendarDates(date: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(date, index));
}

export function calendarWeek(date: string): string[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return calendarDates(monday, 7);
}
