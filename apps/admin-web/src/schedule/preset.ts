/**
 * What the overview hands to the schedule page when someone acts on "these people are working
 * without a schedule": the unit whose month to open and the people to put in it. It travels through
 * storage rather than the URL because the panel routes by section, not by query, and it is consumed
 * once — a reload of the schedule page should not keep re-adding rows.
 */
export interface SchedulePreset {
  readonly orgUnitId: string;
  readonly employeeIds: readonly string[];
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
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as SchedulePreset).orgUnitId !== 'string' ||
      !Array.isArray((parsed as SchedulePreset).employeeIds)
    ) {
      return null;
    }
    const preset = parsed as SchedulePreset;
    return {
      orgUnitId: preset.orgUnitId,
      employeeIds: preset.employeeIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}
