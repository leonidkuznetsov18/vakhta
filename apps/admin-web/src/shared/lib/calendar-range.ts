import { createStore } from 'zustand/vanilla';
export type CalendarUnit = 'day' | 'month' | 'year';
export type CalendarMode = CalendarUnit | 'all';
export interface CalendarRange {
  readonly mode: CalendarUnit;
  readonly from: string;
  readonly to: string;
}
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
interface Draft {
  unit: CalendarUnit;
  from: string | null;
  to: string | null;
  year: number;
}
/** Draft selection does not fetch data until Apply; each mounted picker owns its state. */
export function createCalendarRangeDraft() {
  const store = createStore<Draft>(() => ({
    unit: 'month',
    from: null,
    to: null,
    year: new Date().getFullYear(),
  }));
  return {
    store,
    reset(mode: CalendarMode, from: string, to: string) {
      const unit = mode === 'all' ? 'month' : mode;
      store.setState({
        unit,
        from: mode === 'all' ? null : unitDate(from, unit),
        to: mode === 'all' ? null : unitDate(to, unit),
        year: Number(from.slice(0, 4)),
      });
    },
    setUnit(unit: string) {
      if (unit === 'day' || unit === 'month' || unit === 'year')
        store.setState({ unit, from: null, to: null });
    },
    move(direction: number) {
      const { unit, year } = store.getState();
      store.setState({
        year: Math.max(1000, Math.min(9987, year + direction * (unit === 'year' ? 12 : 1))),
      });
    },
    select(value: string) {
      const { from, to, unit } = store.getState();
      const date = unitDate(value, unit);
      store.setState(from && !to ? orderedRange(from, date) : { from: date, to: null });
    },
    selectDays(from: string | null, to: string | null) {
      store.setState({ from, to });
    },
    value(): CalendarRange | null {
      const { unit, from, to } = store.getState();
      return from && to ? { mode: unit, ...orderedRange(from, to) } : null;
    },
  };
}
