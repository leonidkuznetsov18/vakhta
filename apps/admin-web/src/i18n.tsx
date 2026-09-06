import { LOCALES, isLocale, messages, resolveLocale, type Locale } from '@vakhta/i18n';

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

/** Three buttons, the active one highlighted; usable on the login screen and in the navigation. */
export function LanguageSwitcher() {
  const active = currentLocale();
  const t = messages(active);
  return (
    <div className="lang-switch" role="group" aria-label={t.admin.language}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={locale === active ? 'lang-item active' : 'lang-item'}
          aria-pressed={locale === active}
          lang={locale}
          onClick={() => switchLocale(locale)}
        >
          {t.language.names[locale]}
        </button>
      ))}
    </div>
  );
}
