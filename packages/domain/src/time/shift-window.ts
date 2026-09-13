import { businessDateOf, planInstants, type ShiftTemplateLocal } from './plan.js';

/** A site shift template as the overview reads it. */
export interface SiteShiftTemplate extends ShiftTemplateLocal {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isNight: boolean;
}

/** One concrete occurrence of a template: its business date and instants. */
export interface ShiftWindow {
  readonly templateId: string;
  readonly code: string;
  readonly name: string;
  readonly isNight: boolean;
  /** The local date the shift starts on; a night shift keeps the date it started. */
  readonly businessDate: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** End of the post-shift grace for the checklist and exit QR (owner decision 2026-09-10). */
  readonly closesAt: Date;
}

/**
 * Shift context of a site at an instant (spec 004 D-02): the running shift, the previous shift
 * still inside its closing grace, and the next shift to start. Computed from instants, so a DST
 * night that lasts 11 or 13 hours is reported as it really is.
 */
export interface ShiftContext {
  readonly current: ShiftWindow | null;
  readonly closingPrevious: ShiftWindow | null;
  readonly next: ShiftWindow | null;
}

function occurrences(
  templates: readonly SiteShiftTemplate[],
  timezone: string,
  now: Date,
): ShiftWindow[] {
  const day = 24 * 3_600_000;
  const dates = [
    ...new Set(
      [-1, 0, 1].map((offset) => businessDateOf(new Date(now.getTime() + offset * day), timezone)),
    ),
  ];
  return templates.flatMap((t) =>
    dates.map((date) => {
      const plan = planInstants(date, t, timezone);
      return {
        templateId: t.id,
        code: t.code,
        name: t.name,
        isNight: t.isNight,
        businessDate: plan.businessDate,
        startsAt: plan.planStartAt,
        endsAt: plan.planEndAt,
        closesAt: new Date(plan.planEndAt.getTime()),
      };
    }),
  );
}

export function shiftContext(
  templates: readonly SiteShiftTemplate[],
  timezone: string,
  now: Date,
  graceMinutes: number,
): ShiftContext {
  const t = now.getTime();
  const grace = Math.max(0, graceMinutes) * 60_000;
  const all = occurrences(templates, timezone, now).map((w) => ({
    ...w,
    closesAt: new Date(w.endsAt.getTime() + grace),
  }));
  const latestStart = (a: ShiftWindow, b: ShiftWindow) =>
    b.startsAt.getTime() - a.startsAt.getTime();
  const current =
    all.filter((w) => w.startsAt.getTime() <= t && t < w.endsAt.getTime()).sort(latestStart)[0] ??
    null;
  const closingPrevious =
    all
      .filter((w) => w !== current && w.endsAt.getTime() <= t && t < w.closesAt.getTime())
      .sort(latestStart)[0] ?? null;
  const next =
    all
      .filter((w) => w.startsAt.getTime() > t)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
  return { current, closingPrevious, next };
}

/** Whole minutes left until an instant, never negative. */
export function minutesUntil(instant: Date, now: Date): number {
  return Math.max(0, Math.floor((instant.getTime() - now.getTime()) / 60_000));
}
