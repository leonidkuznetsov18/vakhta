import { describe, expect, it } from 'vitest';
import { serializeCalendarFeed, type CalendarFeedAssignment } from './calendar-feed.js';

const assignment: CalendarFeedAssignment = {
  employeeId: 'employee-1',
  businessDate: '2026-09-15',
  versionNo: 2,
  publishedAt: new Date('2026-09-01T10:00:00Z'),
  planStartAt: new Date('2026-09-15T17:00:00Z'),
  planEndAt: new Date('2026-09-16T05:00:00Z'),
  isNight: true,
  zoneName: 'Лінія 1',
  siteName: 'Завод',
  unitName: 'Цех',
};
describe('personal calendar serialization', () => {
  it('preserves stable event identity, publication timestamps, sequence, UTC times and refresh metadata', () => {
    const text = serializeCalendarFeed([assignment]);
    for (const line of [
      'PRODID:-//Vakhta//Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Vakhta',
      'REFRESH-INTERVAL;VALUE=DURATION:PT3H',
      'X-PUBLISHED-TTL:PT3H',
      'UID:employee-1-2026-09-15@vakhta',
      'SEQUENCE:2',
      'DTSTAMP:20260901T100000Z',
      'LAST-MODIFIED:20260901T100000Z',
      'DTSTART:20260915T170000Z',
      'DTEND:20260916T050000Z',
      'SUMMARY:Night shift · Лінія 1',
      'DESCRIPTION:Завод · Цех',
    ])
      expect(text).toContain(`${line}\r\n`);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toBe(serializeCalendarFeed([assignment]));
  });
  it('escapes text and folds Unicode without splitting an emoji or exceeding 75 octets', () => {
    const long = 'Лінія 😀 '.repeat(30);
    const text = serializeCalendarFeed([
      { ...assignment, zoneName: long, unitName: 'Цех;A,B\\C\nD' },
    ]);
    const decoded = new TextDecoder('utf-8', { fatal: true });
    for (const line of text.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
      expect(decoded.decode(Buffer.from(line))).toBe(line);
      expect(line).not.toContain('\uFFFD');
    }
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:Night shift · ${long.trimEnd()}`);
    expect(unfolded).toContain('DESCRIPTION:Завод · Цех\\;A\\,B\\\\C\\nD');
  });
  it('keeps the historical timestamp fallback and returns a valid empty feed', () => {
    expect(serializeCalendarFeed([{ ...assignment, publishedAt: null }])).toContain(
      'DTSTAMP:20260915T170000Z',
    );
    const empty = serializeCalendarFeed([]);
    expect(empty).toContain('BEGIN:VCALENDAR\r\n');
    expect(empty).not.toContain('BEGIN:VEVENT');
    expect(empty.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
