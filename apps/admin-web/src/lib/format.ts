import type { Locale } from '@vakhta/i18n';
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
