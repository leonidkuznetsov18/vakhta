/** Interface languages supported by the product (bot, panel, kiosk, notifications). */
export const LOCALES = ['uk', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

/** Base language per the requirements (NFR-08); used when nothing better is known. */
export const DEFAULT_LOCALE: Locale = 'ru';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Maps a BCP-47 tag (Telegram `language_code`, browser `navigator.language`,
 * `Accept-Language` header) to a supported locale. Unknown languages fall back to the default.
 */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  for (const candidate of input.split(',')) {
    const primary = candidate.trim().split(';')[0]?.toLowerCase().split(/[-_]/)[0] ?? '';
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
