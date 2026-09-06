import { LOCALES, isLocale, messages, resolveLocale, type Locale } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

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

/** Three small buttons, the active one filled; usable on the login screen and in the sidebar. */
export function LanguageSwitcher({ className }: { readonly className?: string }) {
  const active = currentLocale();
  const t = messages(active);
  return (
    <div className={cn('flex gap-1', className)} role="group" aria-label={t.admin.language}>
      {LOCALES.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant={locale === active ? 'default' : 'outline'}
          aria-pressed={locale === active}
          lang={locale}
          className="flex-1"
          onClick={() => switchLocale(locale)}
        >
          {t.language.names[locale]}
        </Button>
      ))}
    </div>
  );
}
