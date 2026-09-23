import { MoonIcon, SunIcon, SunMoonIcon, type LucideIcon } from 'lucide-react';
import { ShiftPeriod } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

const STYLE: Record<ShiftPeriod, { readonly icon: LucideIcon; readonly className: string }> = {
  [ShiftPeriod.DAY]: {
    icon: SunIcon,
    className:
      'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  },
  [ShiftPeriod.NIGHT]: {
    icon: MoonIcon,
    className:
      'border-indigo-300 bg-indigo-100 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100',
  },
  [ShiftPeriod.FULL_DAY]: {
    icon: SunMoonIcon,
    className:
      'border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-100',
  },
};

/** Colour bar of a shift row; the badge next to it carries the text. */
export const PERIOD_BAR: Record<ShiftPeriod, string> = {
  [ShiftPeriod.DAY]: 'bg-amber-400',
  [ShiftPeriod.NIGHT]: 'bg-indigo-500',
  [ShiftPeriod.FULL_DAY]: 'bg-fuchsia-500',
};

/** The shift type as text with its icon and colour; colour is never the only signal. */
export function PeriodBadge({
  period,
  className,
}: {
  readonly period: ShiftPeriod;
  readonly className?: string;
}) {
  const style = STYLE[period];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {messages(currentLocale()).unitShifts.periods[period]}
    </span>
  );
}

/** A compact shift: hours with the type's icon and colour, for tables. */
export function ShiftChip({
  shift,
}: {
  readonly shift: {
    readonly period: ShiftPeriod;
    readonly localStart: string;
    readonly localEnd: string;
  };
}) {
  const style = STYLE[shift.period];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap tabular-nums',
        style.className,
      )}
    >
      <Icon
        className="size-3"
        aria-label={messages(currentLocale()).unitShifts.periods[shift.period]}
      />
      {shift.localStart}–{shift.localEnd}
    </span>
  );
}
