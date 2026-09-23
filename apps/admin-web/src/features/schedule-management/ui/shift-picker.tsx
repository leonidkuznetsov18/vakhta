import { TriangleAlertIcon } from 'lucide-react';
import { templateMinutes } from '@vakhta/domain';
import type { ShiftTemplateView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { PERIOD_BAR, PeriodBadge, ShiftHours } from '@/entities/shift-template';
import { cn } from 'cn';

const t = messages(currentLocale());

export interface ShiftChoice {
  readonly template: ShiftTemplateView;
  /** Why this shift does not fit the person on that date; still selectable. */
  readonly issue: string | null;
}

/**
 * Shift choice of one assignment (spec 013): the unit's own shifts first, then the site defaults.
 * A shift planned earlier and no longer offered stays visible so an unchanged plan keeps it.
 */
export function ShiftPicker({
  name,
  unitName,
  kept,
  unitChoices,
  standardChoices,
  value,
  disabled,
  onChange,
}: {
  readonly name: string;
  readonly unitName: string;
  readonly kept: ShiftChoice | null;
  readonly unitChoices: readonly ShiftChoice[];
  readonly standardChoices: readonly ShiftChoice[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (templateId: string) => void;
}) {
  const groups = [
    { key: 'kept', title: t.unitShifts.pickerKept, choices: kept ? [kept] : [] },
    {
      key: 'unit',
      title: format(t.unitShifts.pickerUnit, { unit: unitName }),
      choices: unitChoices,
    },
    { key: 'standard', title: t.unitShifts.pickerStandard, choices: standardChoices },
  ].filter((group) => group.choices.length > 0);
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">{t.unitShifts.pickerTitle}</legend>
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.title} className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{group.title}</p>
          {group.choices.map((choice) => (
            <ShiftOption
              key={choice.template.id}
              name={name}
              choice={choice}
              checked={value === choice.template.id}
              onSelect={() => onChange(choice.template.id)}
            />
          ))}
        </div>
      ))}
    </fieldset>
  );
}

function ShiftOption({
  name,
  choice,
  checked,
  onSelect,
}: {
  readonly name: string;
  readonly choice: ShiftChoice;
  readonly checked: boolean;
  readonly onSelect: () => void;
}) {
  const { template, issue } = choice;
  // Hours and type already identify a default; only a unit shift's own name adds meaning.
  const ownName = template.orgUnitId === null ? '' : template.name.trim();
  return (
    <label
      className={cn(
        'flex cursor-pointer items-stretch gap-3 rounded-lg border px-3 py-2 transition-colors',
        'hover:border-sky-300 hover:bg-sky-50/60 active:bg-sky-100 dark:hover:bg-sky-950/40',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        'has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:checked]:ring-1 has-[:checked]:ring-sky-500 dark:has-[:checked]:bg-sky-950',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        issue && !checked && 'opacity-70',
      )}
    >
      <input
        type="radio"
        name={name}
        value={template.id}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className={cn('w-1 shrink-0 rounded-full', PERIOD_BAR[template.period])} aria-hidden />
      <span className="min-w-0 flex-1 space-y-0.5">
        <ShiftHours hours={template} className="block font-semibold" />
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {ownName && <span className="text-foreground">{ownName}</span>}
          <PeriodBadge period={template.period} />
          <span>{formatDuration(templateMinutes(template))}</span>
        </span>
        {issue && (
          <span className="flex items-start gap-1 text-xs text-orange-700 dark:text-orange-300">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {issue}
          </span>
        )}
      </span>
    </label>
  );
}
