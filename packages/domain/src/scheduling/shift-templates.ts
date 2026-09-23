import { ShiftPeriod } from './types.js';

/**
 * Shift templates (spec 013): site defaults (no unit) are offered everywhere, a unit's own
 * templates only in that unit's schedule. A template prefills an assignment; the assignment keeps
 * the template version it was planned with.
 */

export interface TemplateHours {
  /** 'HH:mm' */
  readonly localStart: string;
  /** 'HH:mm'; at or before the start means the next day, equal to it means 24 hours. */
  readonly localEnd: string;
}

export interface ScopedTemplate {
  readonly orgUnitId: string | null;
  readonly isActive: boolean;
}

export interface OrderedTemplate extends TemplateHours {
  readonly period: ShiftPeriod;
  readonly name: string;
}

/** A shift starting at or after this local minute is a night shift unless it lasts 24 hours. */
const NIGHT_START_MINUTE = 18 * 60;
const DAY_MINUTES = 24 * 60;

export const TemplateHoursIssue = {
  FULL_DAY_NEEDS_EQUAL_TIMES: 'FULL_DAY_NEEDS_EQUAL_TIMES',
  EQUAL_TIMES_NEED_FULL_DAY: 'EQUAL_TIMES_NEED_FULL_DAY',
} as const;
export type TemplateHoursIssue = (typeof TemplateHoursIssue)[keyof typeof TemplateHoursIssue];

/** Stable API error codes; clients localize them. */
export const ShiftTemplateError = {
  NOT_FOUND: 'SHIFT_TEMPLATE_NOT_FOUND',
  DEFAULT: 'SHIFT_TEMPLATE_DEFAULT',
  NAME_TAKEN: 'SHIFT_TEMPLATE_NAME_TAKEN',
  STALE: 'SHIFT_TEMPLATE_STALE',
  OUT_OF_UNIT: 'SHIFT_TEMPLATE_OUT_OF_UNIT',
  RETIRED: 'SHIFT_TEMPLATE_RETIRED',
} as const;
export type ShiftTemplateError = (typeof ShiftTemplateError)[keyof typeof ShiftTemplateError];

/** Domain events of the template lifecycle. */
export const ShiftTemplateEvent = {
  CREATED: 'SHIFT_TEMPLATE_CREATED',
  RENAMED: 'SHIFT_TEMPLATE_RENAMED',
  REPLACED: 'SHIFT_TEMPLATE_REPLACED',
  RETIRED: 'SHIFT_TEMPLATE_RETIRED',
  DELETED: 'SHIFT_TEMPLATE_DELETED',
} as const;
export type ShiftTemplateEvent = (typeof ShiftTemplateEvent)[keyof typeof ShiftTemplateEvent];

const PERIOD_ORDER: Record<ShiftPeriod, number> = {
  [ShiftPeriod.DAY]: 0,
  [ShiftPeriod.NIGHT]: 1,
  [ShiftPeriod.FULL_DAY]: 2,
};

function minuteOfDay(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Local length of the template in minutes, ignoring DST: 1…1440. */
export function templateMinutes(hours: TemplateHours): number {
  const length =
    (minuteOfDay(hours.localEnd) - minuteOfDay(hours.localStart) + DAY_MINUTES) % DAY_MINUTES;
  return length === 0 ? DAY_MINUTES : length;
}

export function endsNextDay(hours: TemplateHours): boolean {
  return minuteOfDay(hours.localEnd) <= minuteOfDay(hours.localStart);
}

/** The period the times suggest; the administrator may still choose another valid one. */
export function suggestPeriod(hours: TemplateHours): ShiftPeriod {
  if (hours.localStart === hours.localEnd) return ShiftPeriod.FULL_DAY;
  const crossesMidnight = endsNextDay(hours);
  if (crossesMidnight || minuteOfDay(hours.localStart) >= NIGHT_START_MINUTE) {
    return ShiftPeriod.NIGHT;
  }
  return ShiftPeriod.DAY;
}

/** Full day lasts exactly 24 local hours; day and night shifts are shorter. */
export function templateHoursIssue(
  period: ShiftPeriod,
  hours: TemplateHours,
): TemplateHoursIssue | null {
  const equal = hours.localStart === hours.localEnd;
  if (period === ShiftPeriod.FULL_DAY && !equal) {
    return TemplateHoursIssue.FULL_DAY_NEEDS_EQUAL_TIMES;
  }
  if (period !== ShiftPeriod.FULL_DAY && equal) return TemplateHoursIssue.EQUAL_TIMES_NEED_FULL_DAY;
  return null;
}

/** An unnamed unit shift is known by its hours. */
export function templateDisplayName(template: TemplateHours & { readonly name: string }): string {
  return template.name.trim() || `${template.localStart}–${template.localEnd}`;
}

/** Whether a new or changed assignment of the unit's schedule may use this template. */
export function isTemplateSelectable(template: ScopedTemplate, orgUnitId: string): boolean {
  return template.isActive && (template.orgUnitId === null || template.orgUnitId === orgUnitId);
}

/** Templates the schedule of one unit offers: current site defaults and the unit's own. */
export function templatesForUnit<T extends ScopedTemplate>(
  templates: readonly T[],
  orgUnitId: string,
): T[] {
  return templates.filter((template) => isTemplateSelectable(template, orgUnitId));
}

/**
 * Maps every template version to the current version of its chain. An hours edit retires a used
 * template in favour of a successor; staffing demand and planned shifts on either version describe
 * the same shift, so comparisons between them go through this map.
 */
export function templateLineage(
  templates: readonly { readonly id: string; readonly replacedById: string | null }[],
): (templateId: string) => string {
  const successor = new Map(templates.map((template) => [template.id, template.replacedById]));
  return (templateId) => {
    let current = templateId;
    const seen = new Set<string>();
    for (
      let next = successor.get(current);
      next && !seen.has(next);
      next = successor.get(current)
    ) {
      seen.add(current);
      current = next;
    }
    return current;
  };
}

/** Display order: day, night, full day; then start time; then name in the UI locale. */
export function compareTemplates(
  locale: string,
): (a: OrderedTemplate, b: OrderedTemplate) => number {
  const collator = new Intl.Collator(locale);
  return (a, b) =>
    PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period] ||
    minuteOfDay(a.localStart) - minuteOfDay(b.localStart) ||
    collator.compare(templateDisplayName(a), templateDisplayName(b));
}
