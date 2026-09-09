/**
 * What the overview hands to the schedule page when someone acts on "these people are working
 * without a schedule": the unit, the month and the people themselves. It travels through storage
 * rather than the URL because the panel routes by section, not by query, and it is consumed once —
 * a reload of the schedule page should not keep re-adding rows.
 *
 * The names travel with the ids on purpose: the master arrives having clicked a card and must see
 * whom this is for without holding three surnames in their head.
 */
export interface SchedulePresetPerson {
  readonly id: string;
  readonly name: string;
}

export interface SchedulePreset {
  /** Null when the people are not attached to a unit: the master picks one before planning. */
  readonly orgUnitId: string | null;
  /** 'YYYY-MM' of the shift that was worked without a schedule. */
  readonly month: string;
  readonly people: readonly SchedulePresetPerson[];
}

const KEY = 'vakhta.ui.schedule.preset';

export function writeSchedulePreset(preset: SchedulePreset): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(preset));
  } catch {
    // Storage disabled: the schedule page simply opens without the people prefilled.
  }
}

export function takeSchedulePreset(): SchedulePreset | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const preset = parsed as SchedulePreset;
    const unit = typeof preset.orgUnitId === 'string' ? preset.orgUnitId : null;
    if (!/^\d{4}-\d{2}$/.test(preset.month)) return null;
    if (!Array.isArray(preset.people)) return null;
    const people = preset.people.filter(
      (p): p is SchedulePresetPerson =>
        typeof p?.id === 'string' && typeof (p as SchedulePresetPerson).name === 'string',
    );
    return people.length > 0 ? { orgUnitId: unit, month: preset.month, people } : null;
  } catch {
    return null;
  }
}
