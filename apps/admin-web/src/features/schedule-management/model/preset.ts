import { setUiState } from '@/lib/ui-store';

/**
 * What the overview hands to the schedule page when someone acts on "these people are working
 * without a schedule": the unit, the month and the people themselves. It travels through the
 * screen-state store rather than the URL because the panel routes by section, not by query.
 *
 * The names travel with the ids on purpose: the master arrives having clicked a card and must see
 * whom this is for without holding three surnames in their head.
 */
export interface SchedulePresetPerson {
  readonly id: string;
  readonly name: string;
}

export interface SchedulePreset {
  readonly actorId: string;
  /** Null when the people are not attached to a unit: the master picks one before planning. */
  readonly orgUnitId: string | null;
  /** 'YYYY-MM' of the shift that was worked without a schedule. */
  readonly month: string;
  readonly people: readonly SchedulePresetPerson[];
}

export const PRESET_KEY = 'schedule.preset';
/** Sets the filters the people belong to and leaves the people themselves for the grid. */
export function writeSchedulePreset(preset: SchedulePreset): void {
  setUiState({
    [PRESET_KEY]: preset,
    'schedule.month': preset.month,
    ...(preset.orgUnitId ? { 'schedule.orgUnitId': preset.orgUnitId } : {}),
  });
}

/** The month has been written down: the people are planned and the preset has nothing left to say. */
export function clearSchedulePreset(): void {
  setUiState({ [PRESET_KEY]: null });
}
