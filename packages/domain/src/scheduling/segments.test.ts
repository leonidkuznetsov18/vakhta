import { describe, expect, it } from 'vitest';
import { assignmentInstants, resolveSegments } from './segments.js';

const tz = 'Europe/Kyiv';
const night = { localStart: '20:00', localEnd: '08:00' };

describe('custom time and segments (SC-32, SC-37)', () => {
  it('uses custom local times over the template and keeps next-day ends and DST elapsed time', () => {
    const custom = assignmentInstants(
      { businessDate: '2026-10-24', template: night, customStart: '22:00', customEnd: '06:30' },
      tz,
    );
    expect(custom.planStartAt.toISOString()).toBe('2026-10-24T19:00:00.000Z');
    expect(custom.planEndAt.toISOString()).toBe('2026-10-25T04:30:00.000Z');
    expect(custom.durationMinutes).toBe(9 * 60 + 30);
    const template = assignmentInstants({ businessDate: '2026-09-05', template: night }, tz);
    expect(template.durationMinutes).toBe(12 * 60);
  });
  it('resolves segments that tile the interval, including parts after midnight', () => {
    const interval = {
      ...assignmentInstants({ businessDate: '2026-09-05', template: night }, tz),
      businessDate: '2026-09-05',
    };
    const result = resolveSegments(
      interval,
      [
        { zoneId: 'a', localStart: '20:00', localEnd: '00:00' },
        { zoneId: 'b', localStart: '00:00', localEnd: '08:00' },
      ],
      tz,
    );
    expect(
      'segments' in result &&
        result.segments.map((segment) => [
          segment.position,
          segment.zoneId,
          segment.startAt.toISOString(),
          segment.endAt.toISOString(),
        ]),
    ).toEqual([
      [0, 'a', '2026-09-05T17:00:00.000Z', '2026-09-05T21:00:00.000Z'],
      [1, 'b', '2026-09-05T21:00:00.000Z', '2026-09-06T05:00:00.000Z'],
    ]);
    expect(resolveSegments(interval, [], tz)).toEqual({ segments: [] });
  });
  it('rejects gaps, overlaps, parts outside the interval and empty parts with their position', () => {
    const interval = {
      ...assignmentInstants(
        { businessDate: '2026-09-05', template: { localStart: '08:00', localEnd: '20:00' } },
        tz,
      ),
      businessDate: '2026-09-05',
    };
    const part = (localStart: string, localEnd: string, zoneId = 'z') => ({
      zoneId,
      localStart,
      localEnd,
    });
    expect(resolveSegments(interval, [part('08:00', '12:00'), part('13:00', '20:00')], tz)).toEqual(
      { error: 'SEGMENT_GAP', position: 1 },
    );
    expect(resolveSegments(interval, [part('08:00', '13:00'), part('12:00', '20:00')], tz)).toEqual(
      { error: 'SEGMENT_OVERLAP', position: 1 },
    );
    expect(resolveSegments(interval, [part('08:00', '20:00'), part('20:00', '21:00')], tz)).toEqual(
      { error: 'SEGMENT_BOUNDS', position: 1 },
    );
    expect(resolveSegments(interval, [part('09:00', '20:00')], tz)).toEqual({
      error: 'SEGMENT_GAP',
      position: 0,
    });
    expect(resolveSegments(interval, [part('08:00', '19:00')], tz)).toEqual({
      error: 'SEGMENT_GAP',
      position: 1,
    });
  });
});
