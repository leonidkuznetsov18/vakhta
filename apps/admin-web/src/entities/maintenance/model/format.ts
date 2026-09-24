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

/** "every 2 wk" in the panel language. */
export function formatInterval(
  t: Messages,
  rule: { readonly intervalUnit: IntervalUnit; readonly intervalCount: number },
): string {
  return format(t.maintenance.intervalEvery[rule.intervalUnit], { count: rule.intervalCount });
}

export function maintenanceMessages(): Messages['maintenance'] {
  return messages(currentLocale()).maintenance;
}
