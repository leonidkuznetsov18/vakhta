import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EnglishObjectName, dictionaryLabel, type DictionarySnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { AlertCircleIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/app/query-feedback';
import { InfoTip } from '@/components/app/info-tip';
import { dictionaryApi, dictionaryKeys } from '../api/dictionary-api';
import { DictionaryDetails } from './dictionary-details';

export function DictionaryPicker({
  value,
  onChange,
  onChoose,
  onManual,
  disabled,
  pending = false,
  allowManual = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onChoose: (value: DictionarySnapshot) => void;
  onManual: (name: string) => void;
  disabled: boolean;
  /** The chosen object is being created; its Add button shows it. */
  pending?: boolean;
  allowManual?: boolean;
}) {
  const locale = currentLocale();
  const t = messages(locale).photoDictionary;
  const inputId = useId();
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const q = value.trim();
  const search = useQuery({
    queryKey: dictionaryKeys.search(q, locale),
    queryFn: ({ signal }) => dictionaryApi.search(q, locale, signal),
    enabled: mode === 'search' && q.length >= 2 && !selectedId && open,
    retry: false,
    staleTime: 3_600_000,
  });
  const detail = useQuery({
    queryKey: dictionaryKeys.details(selectedId, locale),
    queryFn: ({ signal }) => {
      if (!selectedId) throw new Error('No dictionary selection');
      return dictionaryApi.details(selectedId, locale, signal);
    },
    enabled: selectedId !== null,
    retry: false,
    staleTime: 3_600_000,
  });
  const manual = EnglishObjectName.safeParse(value);
  const change = (next: string) => {
    setSelectedId(null);
    setOpen(true);
    onChange(next);
  };
  const switchMode = () => {
    setMode(mode === 'search' ? 'manual' : 'search');
    setSelectedId(null);
    setOpen(false);
    onChange('');
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium" htmlFor={inputId}>
          {mode === 'manual' ? t.englishName : t.search}
        </label>
        <InfoTip text={mode === 'manual' ? t.englishHint : t.searchHint} />
      </div>
      {mode === 'manual' ? (
        <>
          <Input
            id={inputId}
            value={value}
            disabled={disabled}
            maxLength={100}
            placeholder={t.englishPlaceholder}
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                manual.success &&
                !disabled
              ) {
                event.preventDefault();
                onManual(manual.data);
              }
            }}
          />
          {value.trim() && !manual.success && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t.englishInvalid}</AlertTitle>
            </Alert>
          )}
          <Button
            type="button"
            className="self-start"
            pending={pending}
            disabled={disabled || !manual.success}
            onClick={() => {
              if (!disabled && manual.success) onManual(manual.data);
            }}
          >
            {t.add}
          </Button>
        </>
      ) : (
        <Command
          label={t.search}
          shouldFilter={false}
          className="h-auto"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              event.stopPropagation();
            }
          }}
        >
          <CommandInput
            aria-label={t.search}
            id={inputId}
            value={value}
            maxLength={100}
            onValueChange={change}
            placeholder={t.placeholder}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            aria-expanded={open && !selectedId && q.length >= 2}
          />
          {open && !selectedId && q.length >= 2 && (
            <>
              <QueryFeedback query={search} errorMessage={t.unavailable} />
              <CommandList label={t.search}>
                {search.data?.items.map((item) => (
                  <CommandItem
                    key={item.conceptId}
                    value={item.conceptId}
                    disabled={disabled}
                    onSelect={() => {
                      if (!disabled) {
                        setSelectedId(item.conceptId);
                        setOpen(false);
                      }
                    }}
                    className="min-h-11 items-start"
                  >
                    <span className="min-w-0 break-words">
                      <strong>{dictionaryLabel(item, locale)}</strong>
                      <span className="ml-2 text-muted-foreground">{item.englishName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.description[locale] || item.description.en}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
              {search.isSuccess && !search.data.items.length && (
                <p className="p-2 text-sm text-muted-foreground">{t.empty}</p>
              )}
              {search.isSuccess && (
                <p className="p-2 text-xs text-muted-foreground">
                  {t.searchCount.replace('{count}', String(search.data.items.length))}
                </p>
              )}
            </>
          )}
        </Command>
      )}
      {selectedId && (
        <>
          <QueryFeedback query={detail} errorMessage={t.unavailable} />
          {detail.data && (
            <>
              <DictionaryDetails value={detail.data} />
              {detail.data.coverage === 'UNAVAILABLE' && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || detail.isFetching}
                  onClick={() => void detail.refetch()}
                >
                  {messages(locale).ui.common.retry}
                </Button>
              )}
              <Button
                type="button"
                className="self-start"
                pending={pending}
                disabled={disabled}
                onClick={() => {
                  if (!disabled && detail.data) {
                    onChoose(detail.data);
                    setSelectedId(null);
                  }
                }}
              >
                {t.choose}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            disabled={disabled}
            onClick={() => setSelectedId(null)}
          >
            {t.cancelled}
          </Button>
        </>
      )}
      {allowManual && (
        <Button
          type="button"
          variant="link"
          className="h-auto self-start whitespace-normal p-0 text-left"
          disabled={disabled}
          onClick={switchMode}
        >
          {mode === 'search' ? t.manual : t.search}
        </Button>
      )}
    </div>
  );
}
