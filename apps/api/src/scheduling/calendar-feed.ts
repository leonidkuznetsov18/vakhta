import ical, { ICalCalendarMethod } from 'ical-generator';
import type { ShiftPeriod } from '@vakhta/domain';

const FEED_REFRESH_SECONDS = 3 * 60 * 60;
// The feed is not localized: calendar apps show it next to other events as plain English.
const FEED_SHIFT_NAMES: Readonly<Record<ShiftPeriod, string>> = {
  DAY: 'Day shift',
  NIGHT: 'Night shift',
  FULL_DAY: 'Full-day shift',
};
export interface CalendarFeedAssignment {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly publishedAt: Date | null;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly versionNo: number;
  readonly period: ShiftPeriod;
  readonly zoneName: string | null;
  readonly siteName: string;
  readonly unitName: string;
}

/** Protocol adapter; callers retain publication, employee scope and token authorization. */
export function serializeCalendarFeed(rows: readonly CalendarFeedAssignment[]): string {
  const calendar = ical({
    prodId: { company: 'Vakhta', product: 'Schedule', language: 'EN' },
    scale: 'GREGORIAN',
    method: ICalCalendarMethod.PUBLISH,
    name: 'Vakhta',
    ttl: FEED_REFRESH_SECONDS,
  });
  for (const row of rows) {
    const stamp = row.publishedAt ?? row.planStartAt;
    calendar.createEvent({
      id: `${row.employeeId}-${row.businessDate}@vakhta`,
      stamp,
      lastModified: stamp,
      sequence: row.versionNo,
      start: row.planStartAt,
      end: row.planEndAt,
      summary: `${FEED_SHIFT_NAMES[row.period]}${row.zoneName ? ` · ${row.zoneName}` : ''}`,
      description: `${row.siteName} · ${row.unitName}`,
    });
  }
  return `${calendar.toString()}\r\n`;
}
