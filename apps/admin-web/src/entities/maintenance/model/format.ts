import { format, messages, type Messages } from '@vakhta/i18n';
import type { IntervalUnit } from '@vakhta/domain';
import { currentLocale } from '@/shared/config';

const INTL = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' } as const;

function dateOf(businessDate: string): Date {
  return new Date(`${businessDate}T00:00:00Z`);
}

/** A business date ('YYYY-MM-DD') as "15.10.2026"; UTC so no time zone moves it to another day. */
export function formatBusinessDate(businessDate: string | null | undefined): string {
  if (!businessDate) return '—';
  return dateOf(businessDate).toLocaleDateString(INTL[currentLocale()], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A business date as "15.10" for dense tables and calendar cells. */
export function formatDayMonth(businessDate: string | null | undefined): string {
  if (!businessDate) return '—';
  return dateOf(businessDate).toLocaleDateString(INTL[currentLocale()], {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}

/** "22.09" within the current year, "15.01.2027" beyond it, so a far date never reads as a near one. */
export function formatNearDate(businessDate: string | null | undefined): string {
  if (!businessDate) return '—';
  const thisYear = String(new Date().getFullYear());
  return businessDate.startsWith(thisYear)
    ? formatDayMonth(businessDate)
    : formatBusinessDate(businessDate);
}

/** The local day of an instant as "22.09". */
export function formatInstantDayMonth(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(INTL[currentLocale()], {
    day: '2-digit',
    month: '2-digit',
  });
}

/** An instant as "22.09 14:05": dense work cards read day and time, the year is implied. */
export function formatDayTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Date(iso).toLocaleTimeString(INTL[currentLocale()], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatInstantDayMonth(iso)} ${time}`;
}

/** The machine as people name it on the shop floor: "M-02 NEWTOP-FB158SV1" (model, else name). */
export function machineLabel(machine: {
  readonly code: string;
  readonly model?: string | null;
  readonly name: string;
}): string {
  return `${machine.code} ${machine.model ?? machine.name}`;
}

/**
 * "кожні 3 дні", "кожен тиждень" in the panel language. A count of one reads as a plain "every";
 * other counts pick the word form by the locale's plural rules (21 → "день", 22 → "дні").
 */
export function formatInterval(rule: {
  readonly intervalUnit: IntervalUnit;
  readonly intervalCount: number;
}): string {
  const forms = maintenanceMessages().intervalEvery[rule.intervalUnit];
  if (rule.intervalCount === 1) return forms.single;
  const category = new Intl.PluralRules(INTL[currentLocale()]).select(rule.intervalCount);
  const byCategory: Readonly<Record<string, string>> = forms;
  return format(byCategory[category] ?? forms.other, { count: rule.intervalCount });
}

export function maintenanceMessages(): Messages['maintenance'] {
  return messages(currentLocale()).maintenance;
}
