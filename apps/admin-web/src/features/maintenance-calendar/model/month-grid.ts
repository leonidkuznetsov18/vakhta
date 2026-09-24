import type { CalendarForecast, CalendarItem, MaintenanceCalendarView } from '@vakhta/contracts';
import { MaterialsReadiness, WorkStatus, WorkType } from '@vakhta/domain';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Pure calendar arithmetic on UTC midnights; no instant is turned into a business day here. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 'YYYY-MM' moved by whole months. */
export function shiftMonth(month: string, step: number): string {
  const [year, index] = month.split('-').map(Number);
  const moved = new Date(Date.UTC(year ?? 1970, (index ?? 1) - 1 + step, 1));
  return moved.toISOString().slice(0, 7);
}

export interface GridDay {
  readonly date: string;
  readonly inMonth: boolean;
}

/** Whole weeks from the Monday on or before the 1st to the Sunday on or after the last day. */
export function monthGrid(month: string): GridDay[] {
  const first = utc(`${month}-01`);
  const last = utc(`${shiftMonth(month, 1)}-01`) - DAY_MS;
  const weekday = (new Date(first).getUTCDay() + 6) % WEEK_DAYS;
  const start = first - weekday * DAY_MS;
  const days: GridDay[] = [];
  for (let ms = start; ms <= last || days.length % WEEK_DAYS !== 0; ms += DAY_MS) {
    const date = iso(ms);
    days.push({ date, inMonth: date.startsWith(month) });
  }
  return days;
}

export function gridRange(month: string): { from: string; to: string } {
  const days = monthGrid(month);
  return { from: days[0]?.date ?? `${month}-01`, to: days.at(-1)?.date ?? `${month}-28` };
}

/** How an entry is drawn; one hue per meaning (owner rule 2026-09-13). */
export const EntryTone = {
  PLANNED: 'PLANNED',
  MISSING: 'MISSING',
  OVERDUE: 'OVERDUE',
  EMERGENCY: 'EMERGENCY',
  DONE: 'DONE',
  FORECAST: 'FORECAST',
} as const;
export type EntryTone = (typeof EntryTone)[keyof typeof EntryTone];

export const EntryKind = { WORK: 'WORK', FORECAST: 'FORECAST' } as const;

export type CalendarEntry =
  | {
      readonly kind: typeof EntryKind.WORK;
      readonly key: string;
      readonly tone: EntryTone;
      readonly item: CalendarItem;
    }
  | {
      readonly kind: typeof EntryKind.FORECAST;
      readonly key: string;
      readonly tone: EntryTone;
      readonly forecast: CalendarForecast;
    };

export function workTone(item: CalendarItem): EntryTone {
  if (item.type === WorkType.EMERGENCY_REPAIR) return EntryTone.EMERGENCY;
  if (item.status === WorkStatus.COMPLETED) return EntryTone.DONE;
  if (item.overdue) return EntryTone.OVERDUE;
  if (item.readiness === MaterialsReadiness.MISSING) return EntryTone.MISSING;
  return EntryTone.PLANNED;
}

const TONE_ORDER: Readonly<Record<EntryTone, number>> = {
  EMERGENCY: 0,
  OVERDUE: 1,
  MISSING: 2,
  PLANNED: 3,
  DONE: 4,
  FORECAST: 5,
};

function label(entry: CalendarEntry): string {
  return entry.kind === EntryKind.WORK
    ? `${entry.item.equipmentCode} ${entry.item.title}`
    : `${entry.forecast.equipmentCode} ${entry.forecast.title}`;
}

/** Deterministic order in a cell: urgency first, then machine and title in the UI locale. */
function compareEntries(locale: string) {
  return (a: CalendarEntry, b: CalendarEntry) =>
    TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || label(a).localeCompare(label(b), locale);
}

/** Work and forecast grouped by calendar day, each day sorted. */
export function entriesByDay(
  view: MaintenanceCalendarView,
  locale: string,
): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (date: string, entry: CalendarEntry) => {
    const list = byDay.get(date);
    if (list) list.push(entry);
    else byDay.set(date, [entry]);
  };
  for (const item of view.items)
    add(item.date, { kind: EntryKind.WORK, key: item.workOrderId, tone: workTone(item), item });
  for (const forecast of view.forecast)
    add(forecast.date, {
      kind: EntryKind.FORECAST,
      key: `${forecast.planId}:${forecast.date}`,
      tone: EntryTone.FORECAST,
      forecast,
    });
  for (const list of byDay.values()) list.sort(compareEntries(locale));
  return byDay;
}
