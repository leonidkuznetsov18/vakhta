import { UNIT_SHIFT_NAME_MAX, type ShiftTemplateView } from '@vakhta/contracts';
import {
  ShiftPeriod,
  compareTemplates,
  suggestPeriod,
  templateDisplayName,
  templateHoursIssue,
  type TemplateHoursIssue,
} from '@vakhta/domain';

/** Lengths a shift is most often planned with; each sets the end from the start. A full day is a type. */
export const LENGTH_PRESETS = [6, 8, 12] as const;

export interface ShiftDraft {
  readonly name: string;
  readonly period: ShiftPeriod;
  readonly localStart: string;
  readonly localEnd: string;
  /** Once the administrator picks a type, new hours stop suggesting one. */
  readonly periodChosen: boolean;
}

export interface DraftIssues {
  readonly hours: TemplateHoursIssue | null;
  readonly nameTaken: boolean;
  readonly nameTooLong: boolean;
}

export const NEW_SHIFT: ShiftDraft = {
  name: '',
  period: ShiftPeriod.DAY,
  localStart: '08:00',
  localEnd: '16:00',
  periodChosen: false,
};

export function draftOf(template: ShiftTemplateView): ShiftDraft {
  return {
    name: template.name,
    period: template.period,
    localStart: template.localStart,
    localEnd: template.localEnd,
    periodChosen: true,
  };
}

export function withHours(draft: ShiftDraft, localStart: string, localEnd: string): ShiftDraft {
  const hours = { localStart, localEnd };
  return { ...draft, ...hours, period: draft.periodChosen ? draft.period : suggestPeriod(hours) };
}

/** A chosen full day keeps ending when it starts. */
export function withStart(draft: ShiftDraft, localStart: string): ShiftDraft {
  const fullDay = draft.periodChosen && draft.period === ShiftPeriod.FULL_DAY;
  return withHours(draft, localStart, fullDay ? localStart : draft.localEnd);
}

export function withLength(draft: ShiftDraft, hours: number): ShiftDraft {
  return withHours(draft, draft.localStart, shiftedTime(draft.localStart, hours * 60));
}

/** A full day ends when it starts, so choosing it moves the end. */
export function withPeriod(draft: ShiftDraft, period: ShiftPeriod): ShiftDraft {
  const localEnd = period === ShiftPeriod.FULL_DAY ? draft.localStart : draft.localEnd;
  return { ...draft, period, localEnd, periodChosen: true };
}

export function draftIssues(draft: ShiftDraft, takenNames: ReadonlySet<string>): DraftIssues {
  return {
    hours: templateHoursIssue(draft.period, draft),
    nameTaken: takenNames.has(nameKey(draft)),
    nameTooLong: draft.name.trim().length > UNIT_SHIFT_NAME_MAX,
  };
}

/** Save needs a valid draft that differs from what is saved. */
export function canSubmit(
  draft: ShiftDraft,
  saved: ShiftDraft | null,
  issues: DraftIssues,
): boolean {
  const valid = !issues.hours && !issues.nameTaken && !issues.nameTooLong;
  return valid && (saved === null || !sameShift(draft, saved));
}

export function sameShift(a: ShiftDraft, b: ShiftDraft): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.period === b.period &&
    a.localStart === b.localStart &&
    a.localEnd === b.localEnd
  );
}

/** Names already used by the unit's current shifts; an unnamed shift is named by its hours. */
export function takenNames(
  shifts: readonly ShiftTemplateView[],
  exceptId: string | null,
): ReadonlySet<string> {
  return new Set(shifts.filter((shift) => shift.id !== exceptId).map(nameKey));
}

/** The unit's current own shifts in display order. */
export function unitShifts(
  templates: readonly ShiftTemplateView[],
  orgUnitId: string,
  locale: string,
): ShiftTemplateView[] {
  return templates
    .filter((template) => template.orgUnitId === orgUnitId && template.isActive)
    .sort(compareTemplates(locale));
}

export function standardShifts(
  templates: readonly ShiftTemplateView[],
  locale: string,
): ShiftTemplateView[] {
  return templates
    .filter((template) => template.orgUnitId === null && template.isActive)
    .sort(compareTemplates(locale));
}

function nameKey(shift: Pick<ShiftDraft, 'name' | 'localStart' | 'localEnd'>): string {
  return templateDisplayName({ ...shift, name: shift.name.trim() }).toLocaleLowerCase();
}

function shiftedTime(value: string, minutes: number): string {
  const [hours = 0, mins = 0] = value.split(':').map(Number);
  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
