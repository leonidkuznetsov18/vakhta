import { DEFAULT_LOCALE, LOCALES, isLocale, messages, type Locale } from '@vakhta/i18n';
import type { ControlMessages } from '@vakhta/i18n';

const LOCALE_KEY = 'vakhta.control.locale';

/** Stored choice, then the browser language, then the platform default; Ukrainian first for operators. */
export function currentLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    // Storage unavailable: fall through.
  }
  const browser = navigator.language.slice(0, 2);
  return isLocale(browser) ? browser : DEFAULT_LOCALE;
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Storage unavailable: the page reload still applies the browser language.
  }
  location.reload();
}

export function t(): ControlMessages {
  return messages(currentLocale()).control;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export { LOCALES, type Locale };
