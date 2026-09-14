import { dictionaryLabel, type DictionarySnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { XIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { IconButton } from '@/shared/ui/icon-button';
import { InfoTip } from '@/components/app/info-tip';
export function DictionaryDetails({
  value,
  onExclude,
  disabled = false,
}: {
  value: DictionarySnapshot;
  onExclude?: (name: string) => void;
  disabled?: boolean;
}) {
  const locale = currentLocale();
  const t = messages(locale).photoDictionary;
  const explanation = value.description[locale] || value.description.en;
  const coverage = {
    CURATED: t.reviewed,
    DIRECT: t.direct,
    LIMITED: t.limited,
    UNAVAILABLE: t.missing,
  }[value.coverage];
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm" data-testid="dictionary-details">
      <p className="break-words">
        <span className="text-muted-foreground">{t.englishStored}: </span>
        <strong>{value.englishName}</strong>
      </p>
      {explanation && (
        <p className="max-h-24 overflow-y-auto break-words text-muted-foreground">{explanation}</p>
      )}
      {value.aliases.length > 0 && (
        <p className="max-h-24 overflow-y-auto break-words">
          <span className="text-muted-foreground">{t.aliases}: </span>
          {value.aliases.join(', ')}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span>
          {t.variants} ({value.variants.length})
        </span>
        <InfoTip text={coverage} />
      </div>
      <ul className="flex max-h-48 flex-wrap gap-2 overflow-y-auto" aria-label={t.variants}>
        {value.variants.map((variant) => (
          <li
            key={variant.englishName}
            className="flex max-w-full items-center gap-1 rounded-md border px-2 py-1"
          >
            <span className="min-w-0 break-words">
              {dictionaryLabel(variant, locale)}
              {locale !== 'en' && dictionaryLabel(variant, locale) !== variant.englishName && (
                <span className="block text-xs text-muted-foreground">{variant.englishName}</span>
              )}
            </span>
            {onExclude && (
              <IconButton
                type="button"
                icon={XIcon}
                label={`${t.removeVariant}: ${dictionaryLabel(variant, locale)}`}
                tooltip={t.removeVariant}
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onExclude(variant.englishName)}
              />
            )}
          </li>
        ))}
      </ul>
      {!!value.excludedVariants?.length && (
        <div>
          <p>
            {t.excludedVariants} ({value.excludedVariants.length})
          </p>
          <p className="max-h-24 overflow-y-auto break-words text-muted-foreground">
            {value.excludedVariants.map((variant) => dictionaryLabel(variant, locale)).join(', ')}
          </p>
        </div>
      )}
      <a
        className="w-fit rounded text-xs text-muted-foreground underline hover:text-foreground active:text-foreground focus-visible:outline focus-visible:outline-2"
        href={`https://www.wikidata.org/wiki/${value.conceptId}`}
        target="_blank"
        rel="noreferrer"
      >
        {value.source === 'CURATED' ? t.curated : `${t.source}: Wikidata`}
      </a>
    </div>
  );
}
