import { messages, type Locale } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

const INTL: Record<Locale, string> = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' };

function tag(): string {
  return INTL[currentLocale()];
}

/** "07.09.2026, 08:10" in the panel language; "—" for missing instants. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString(tag(), { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

export function formatDateTimeSeconds(iso: string): string {
  return new Date(iso).toLocaleString(tag(), { dateStyle: 'short', timeStyle: 'medium' });
}

/** "08:10" in the panel language. */
export function formatTime(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleTimeString(tag(), { hour: '2-digit', minute: '2-digit' })
    : '—';
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(tag(), { dateStyle: 'short' }) : '—';
}

/** "Сентябрь 2026" from 'YYYY-MM', capitalised for headings. */
export function formatMonth(value: string): string {
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return value;
  // UTC on both sides: a local midnight formatted in another zone would name the previous month.
  const text = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(INTL[currentLocale()], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A span of time with its unit on it: "166 h 39 min", "45 min". A bare number of minutes beside a
 * label like "total shift time" reads as anything — minutes, hours, or shifts.
 */
export function formatDuration(minutes: number): string {
  const t = messages(currentLocale()).ui.common;
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} ${t.minutesShort}`;
  return m === 0 ? `${h} ${t.hoursShort}` : `${h} ${t.hoursShort} ${m} ${t.minutesShort}`;
}
