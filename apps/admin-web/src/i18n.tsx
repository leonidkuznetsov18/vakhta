import { LOCALES, messages, type Locale } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { SELECTED_TOGGLE } from '@/components/app/page';

import { currentLocale, switchLocale } from '@/shared/config';
export { currentLocale, switchLocale } from '@/shared/config';

/**
 * Symbol of each interface language; the language name stays the accessible label and tooltip.
 * Russian is shown as a plain "РУ" badge, not a flag, by the customer's choice.
 */
const LOCALE_FLAGS: Readonly<Record<Locale, string>> = { uk: '🇺🇦', en: '🇬🇧', ru: 'РУ' };

/** Three small flag buttons, the active one filled; usable on the login screen and in the sidebar. */
/** One button for the collapsed rail: shows the current language, a click moves to the next one. */
export function CompactLanguageSwitcher({ className }: { readonly className?: string }) {
  const active = currentLocale();
  const t = messages(active);
  const next = LOCALES[(LOCALES.indexOf(active) + 1) % LOCALES.length]!;
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={`${t.admin.language}: ${t.language.names[active]}`}
      title={`${t.language.names[active]} → ${t.language.names[next]}`}
      lang={active}
      className={cn('size-8 text-base leading-none font-semibold', className)}
      onClick={() => switchLocale(next)}
    >
      <span aria-hidden="true">{LOCALE_FLAGS[active]}</span>
    </Button>
  );
}

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
          variant="outline"
          aria-pressed={locale === active}
          aria-label={t.language.names[locale]}
          title={t.language.names[locale]}
          lang={locale}
          className={cn(
            'flex-1 text-base leading-none font-semibold',
            locale === active && SELECTED_TOGGLE,
          )}
          onClick={() => switchLocale(locale)}
        >
          <span aria-hidden="true">{LOCALE_FLAGS[locale]}</span>
        </Button>
      ))}
    </div>
  );
}
