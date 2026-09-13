import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { formatDuration } from '@/lib/format';

/** Local wall time of an instant at a site, e.g. "08:00": shifts are read in the site's zone. */
export function siteTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** Local date of a business date string without shifting it through the browser's zone. */
export function businessDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(fromIso: string | Date, to: Date): number {
  const from = typeof fromIso === 'string' ? new Date(fromIso) : fromIso;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/** Whole minutes from now until an instant, never negative. */
export function minutesUntil(iso: string, now: Date): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / 60_000));
}

export function listLabel(items: readonly string[]): string {
  return items.join(', ');
}

export const overviewText = () => messages(currentLocale()).overviewCenter;

/** A waiting time: minutes and hours as usual, whole days once it exceeds a day ("5 дн 19 год"). */
export function formatAge(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  if (whole < 24 * 60) return formatDuration(whole);
  const days = Math.floor(whole / (24 * 60));
  const hours = Math.floor((whole % (24 * 60)) / 60);
  const t = messages(currentLocale());
  return hours === 0
    ? `${days} ${t.overviewCenter.daysShort}`
    : `${days} ${t.overviewCenter.daysShort} ${hours} ${t.ui.common.hoursShort}`;
}
