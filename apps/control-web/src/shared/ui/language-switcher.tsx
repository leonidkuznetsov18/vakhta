import { messages } from '@vakhta/i18n';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { LOCALES, currentLocale, setLocale, type Locale } from '@/shared/i18n';

export const SELECTED_TOGGLE =
  'border-emerald-500 text-foreground shadow-sm shadow-emerald-100 dark:border-emerald-600 dark:shadow-none';

/** The same symbols as the tenant panel: Russian is a plain "РУ" badge by the customer's choice. */
const LOCALE_FLAGS: Readonly<Record<Locale, string>> = { uk: '🇺🇦', en: '🇬🇧', ru: 'РУ' };

/** Three flag buttons, the active one outlined; used on signed-out screens and in the sidebar. */
export function LanguageSwitcher({ className }: { readonly className?: string }) {
  const active = currentLocale();
  const m = messages(active);
  return (
    <div className={cn('flex gap-1', className)} role="group" aria-label={m.admin.language}>
      {LOCALES.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={locale === active}
          aria-label={m.language.names[locale]}
          title={m.language.names[locale]}
          lang={locale}
          className={cn(
            'flex-1 text-base leading-none font-semibold',
            locale === active && SELECTED_TOGGLE,
          )}
          onClick={() => setLocale(locale)}
        >
          <span aria-hidden="true">{LOCALE_FLAGS[locale]}</span>
        </Button>
      ))}
    </div>
  );
}

/** One button for the collapsed rail: shows the current language, a click moves to the next one. */
export function CompactLanguageSwitcher() {
  const active = currentLocale();
  const m = messages(active);
  const next = LOCALES[(LOCALES.indexOf(active) + 1) % LOCALES.length] ?? LOCALES[0];
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="size-8 text-base leading-none font-semibold"
      aria-label={`${m.admin.language}: ${m.language.names[active]}`}
      title={m.language.names[next]}
      lang={active}
      onClick={() => setLocale(next)}
    >
      <span aria-hidden="true">{LOCALE_FLAGS[active]}</span>
    </Button>
  );
}
