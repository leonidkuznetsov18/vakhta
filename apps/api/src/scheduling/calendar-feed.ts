import ical, { ICalCalendarMethod } from 'ical-generator';

const FEED_REFRESH_SECONDS = 3 * 60 * 60;
export interface CalendarFeedAssignment {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly publishedAt: Date | null;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly versionNo: number;
  readonly isNight: boolean;
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
      summary: `${row.isNight ? 'Night' : 'Day'} shift${row.zoneName ? ` · ${row.zoneName}` : ''}`,
      description: `${row.siteName} · ${row.unitName}`,
    });
  }
  return `${calendar.toString()}\r\n`;
}
