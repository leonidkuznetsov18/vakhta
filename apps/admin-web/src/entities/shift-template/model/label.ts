import { ShiftPeriod, compareTemplates, templateDisplayName } from '@vakhta/domain';
import type { ShiftTemplateView } from '@vakhta/contracts';

export interface PeriodShiftNames {
  readonly dayShift: string;
  readonly nightShift: string;
  readonly fullDayShift: string;
}

/** A site default is named by its localized period; a unit shift by its own name or hours. */
export function shiftTemplateLabel(
  template: Pick<ShiftTemplateView, 'orgUnitId' | 'period' | 'name' | 'localStart' | 'localEnd'>,
  names: PeriodShiftNames,
): string {
  if (template.orgUnitId !== null) return templateDisplayName(template);
  const byPeriod: Record<ShiftPeriod, string> = {
    [ShiftPeriod.DAY]: names.dayShift,
    [ShiftPeriod.NIGHT]: names.nightShift,
    [ShiftPeriod.FULL_DAY]: names.fullDayShift,
  };
  return byPeriod[template.period];
}

/** Owner palette: day amber, night indigo, full day fuchsia. */
export const PERIOD_TONE = {
  [ShiftPeriod.DAY]: 'amber',
  [ShiftPeriod.NIGHT]: 'indigo',
  [ShiftPeriod.FULL_DAY]: 'fuchsia',
} as const satisfies Record<ShiftPeriod, string>;

/** Current unit shifts grouped by unit, each group in display order. */
export function currentShiftsByUnit(
  templates: readonly ShiftTemplateView[],
  locale: string,
): ReadonlyMap<string, readonly ShiftTemplateView[]> {
  const byUnit = new Map<string, ShiftTemplateView[]>();
  for (const template of templates) {
    if (template.orgUnitId === null || !template.isActive) continue;
    const group = byUnit.get(template.orgUnitId) ?? [];
    group.push(template);
    byUnit.set(template.orgUnitId, group);
  }
  for (const group of byUnit.values()) group.sort(compareTemplates(locale));
  return byUnit;
}
