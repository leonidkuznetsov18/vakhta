import { tenantConfig } from '@vakhta/tenant-client';
import { isLocale, resolveLocale, type Locale } from '@vakhta/i18n';

const STORAGE_KEY = 'vakhta.locale';

/**
 * Panel language: the explicit choice from localStorage, otherwise the browser language.
 * Read once at module load; switching reloads the page so every module re-evaluates its catalog.
 */
export function currentLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked site data): fall through to the browser language.
  }
  if (tenantConfig()) return resolveLocale(tenantConfig()?.defaultLocale);
  return resolveLocale(typeof navigator === 'undefined' ? null : navigator.language);
}

export function switchLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Without storage the choice lives until the reload only; still better than nothing.
  }
  location.reload();
}
