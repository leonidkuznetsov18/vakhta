import { planInstants } from '../time/plan.js';
import { addDays } from './schedule.js';

/** Default reminder policy (spec A-4); tenants may override offsets and the local time. */
export const DEFAULT_MAINTENANCE_REMINDER_OFFSETS = [7, 3, 1] as const;
export const DEFAULT_MAINTENANCE_REMINDER_TIME = '09:00';

export interface ReminderFire {
  readonly offsetDays: number;
  readonly fireAt: Date;
}

export interface ReminderPlan {
  /** Reminders still ahead, earliest first. */
  readonly fires: readonly ReminderFire[];
  /** A skipped offset is replaced by one immediate notice, never sent late (FR-041). */
  readonly notifyNow: boolean;
}

/** Where and when reminders fire: the site's time zone and local time (spec A-4). */
export interface ReminderClock {
  readonly localTime: string;
  readonly timezone: string;
}

/** The instant a reminder fires: `offsetDays` before the planned date at the site's local time. */
export function reminderInstant(plannedOn: string, offsetDays: number, clock: ReminderClock): Date {
  return planInstants(
    addDays(plannedOn, -offsetDays),
    { localStart: clock.localTime, localEnd: clock.localTime },
    clock.timezone,
  ).planStartAt;
}

export interface ReminderPlanInput extends ReminderClock {
  readonly plannedOn: string;
  readonly offsets: readonly number[];
  readonly now: Date;
}

/**
 * Which reminders to schedule for a work item planned on `plannedOn` (FR-040, FR-041). Offsets
 * whose moment has passed are dropped; if any was dropped while the date is still ahead, the
 * mechanic gets one notice now.
 */
export function reminderPlan(input: ReminderPlanInput): ReminderPlan {
  const unique = [...new Set(input.offsets.filter((offset) => offset > 0))].sort((a, b) => b - a);
  const all = unique.map((offsetDays) => ({
    offsetDays,
    fireAt: reminderInstant(input.plannedOn, offsetDays, input),
  }));
  const fires = all.filter((fire) => fire.fireAt > input.now);
  const dayEnd = reminderInstant(input.plannedOn, -1, { ...input, localTime: '00:00' });
  const skipped = fires.length < all.length;
  return { fires, notifyNow: skipped && input.now < dayEnd };
}
