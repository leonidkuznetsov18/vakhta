import { planInstants } from '../time/plan.js';

/**
 * Custom assignment time and zone segments (SC-32, SC-37, D-04). An assignment keeps one
 * identity and one planned interval; a custom interval replaces the template times on that
 * business date, and ordered segments tile the interval without gaps or overlaps.
 */

export interface AssignmentTime {
  readonly businessDate: string;
  readonly template: { readonly localStart: string; readonly localEnd: string };
  readonly customStart?: string | null | undefined;
  readonly customEnd?: string | null | undefined;
}

/** Planned instants of an assignment: custom local times when present, otherwise the template. */
export function assignmentInstants(
  time: AssignmentTime,
  timezone: string,
): { readonly planStartAt: Date; readonly planEndAt: Date; readonly durationMinutes: number } {
  const source =
    time.customStart && time.customEnd
      ? { localStart: time.customStart, localEnd: time.customEnd }
      : time.template;
  const plan = planInstants(time.businessDate, source, timezone);
  return {
    planStartAt: plan.planStartAt,
    planEndAt: plan.planEndAt,
    durationMinutes: plan.durationMinutes,
  };
}

export interface SegmentInput {
  readonly zoneId: string;
  readonly localStart: string;
  readonly localEnd: string;
}

export interface SegmentInstants extends SegmentInput {
  readonly position: number;
  readonly startAt: Date;
  readonly endAt: Date;
}

export type SegmentError = 'SEGMENT_BOUNDS' | 'SEGMENT_GAP' | 'SEGMENT_OVERLAP' | 'SEGMENT_EMPTY';

/**
 * Resolves segment local times inside the planned interval (a time before the shift start belongs
 * to the next calendar day) and checks that the segments tile the interval in order.
 */
export function resolveSegments(
  interval: { readonly planStartAt: Date; readonly planEndAt: Date; readonly businessDate: string },
  segments: readonly SegmentInput[],
  timezone: string,
):
  | { readonly segments: SegmentInstants[] }
  | { readonly error: SegmentError; readonly position: number } {
  if (segments.length === 0) return { segments: [] };
  const resolved: SegmentInstants[] = [];
  let cursor = interval.planStartAt.getTime();
  for (const [position, segment] of segments.entries()) {
    const sameDay = planInstants(
      interval.businessDate,
      { localStart: segment.localStart, localEnd: segment.localEnd },
      timezone,
    );
    // A part whose start lies before the shift start on the business date starts the next day.
    let startAt = sameDay.planStartAt.getTime();
    let endAt = sameDay.planEndAt.getTime();
    if (startAt < interval.planStartAt.getTime()) {
      const shifted = planInstants(
        nextDate(interval.businessDate),
        { localStart: segment.localStart, localEnd: segment.localEnd },
        timezone,
      );
      startAt = shifted.planStartAt.getTime();
      endAt = shifted.planEndAt.getTime();
    }
    if (endAt <= startAt) return { error: 'SEGMENT_EMPTY', position };
    if (startAt < interval.planStartAt.getTime() || endAt > interval.planEndAt.getTime())
      return { error: 'SEGMENT_BOUNDS', position };
    if (startAt < cursor) return { error: 'SEGMENT_OVERLAP', position };
    if (startAt > cursor) return { error: 'SEGMENT_GAP', position };
    resolved.push({ ...segment, position, startAt: new Date(startAt), endAt: new Date(endAt) });
    cursor = endAt;
  }
  if (cursor !== interval.planEndAt.getTime())
    return { error: 'SEGMENT_GAP', position: segments.length };
  return { segments: resolved };
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
