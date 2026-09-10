import { setUiState, uiState } from '@/lib/ui-store';

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
  /** Null when the people are not attached to a unit: the master picks one before planning. */
  readonly orgUnitId: string | null;
  /** 'YYYY-MM' of the shift that was worked without a schedule. */
  readonly month: string;
  readonly people: readonly SchedulePresetPerson[];
}

export const PRESET_KEY = 'schedule.preset';
/** Which version request has already gone out for the preset, so a remount never sends another. */
const ASKED_KEY = 'schedule.presetAsked';

/** Sets the filters the people belong to and leaves the people themselves for the grid. */
export function writeSchedulePreset(preset: SchedulePreset): void {
  setUiState({
    [PRESET_KEY]: preset,
    [ASKED_KEY]: null,
    'schedule.month': preset.month,
    ...(preset.orgUnitId ? { 'schedule.orgUnitId': preset.orgUnitId } : {}),
  });
}

/**
 * True once, for the first caller asking for a version to hold these people. The claim lives in
 * the store rather than in a ref, so the second run of a development remount sees it too.
 */
export function claimPresetVersion(token: string): boolean {
  if (uiState<string | null>(ASKED_KEY) === token) return false;
  setUiState({ [ASKED_KEY]: token });
  return true;
}

/** The month has been written down: the people are planned and the preset has nothing left to say. */
export function clearSchedulePreset(): void {
  setUiState({ [PRESET_KEY]: null, [ASKED_KEY]: null });
}
