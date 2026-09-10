import { useState } from 'react';
import { useStore } from 'zustand';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormField } from '@/components/app/fields';
import { currentLocale } from '@/i18n';
import { formatDate, formatMonth } from '@/lib/format';
import { dayPickerLocale, fromIsoDate, toIsoDate } from '../lib/calendar-date';
import {
  createCalendarRangeDraft,
  type CalendarMode,
  type CalendarRange,
  type CalendarUnit,
} from '../lib/calendar-range';

function periodText(date: string, unit: CalendarUnit): string {
  return unit === 'year'
    ? date.slice(0, 4)
    : unit === 'month'
      ? formatMonth(date.slice(0, 7))
      : formatDate(date);
}

/** One shared From/To picker; only day mode renders day cells. */
export function CalendarPeriodField({
  label,
  from,
  to,
  mode,
  labels,
  open,
  onOpenChange,
  onApply,
  onClear,
}: {
  label: string;
  from: string;
  to: string;
  mode: CalendarMode;
  labels: { day: string; month: string; year: string; all: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (range: CalendarRange) => void;
  onClear: () => void;
}) {
  const [model] = useState(createCalendarRangeDraft);
  const draft = useStore(model.store);
  const t = messages(currentLocale()).ui;
  const labelText =
    mode === 'all' ? labels.all : `${periodText(from, mode)} — ${periodText(to, mode)}`;
  const startYear = Math.floor(draft.year / 12) * 12;
  const options = Array.from({ length: 12 }, (_, index) => {
    const value =
      draft.unit === 'year'
        ? `${startYear + index}-01-01`
        : `${draft.year}-${String(index + 1).padStart(2, '0')}-01`;
    return {
      value,
      text:
        draft.unit === 'year'
          ? String(startYear + index)
          : new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(
              new Date(draft.year, index, 1),
            ),
    };
  });
  function changeOpen(next: boolean) {
    if (next) model.reset(mode, from, to);
    onOpenChange(next);
  }
  return (
    <FormField label={label} className="w-72 max-w-full">
      {(id) => (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className="w-full justify-start font-normal"
            >
              <CalendarIcon aria-hidden="true" />
              <span className="truncate tabular-nums" title={labelText}>
                {labelText}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[19.5rem] p-0" align="start">
            <Tabs value={draft.unit} onValueChange={model.setUnit} className="p-3 pb-0">
              <TabsList className="w-full" aria-label={label}>
                <TabsTrigger value="day">{labels.day}</TabsTrigger>
                <TabsTrigger value="month">{labels.month}</TabsTrigger>
                <TabsTrigger value="year">{labels.year}</TabsTrigger>
              </TabsList>
            </Tabs>
            <dl className="grid grid-cols-2 gap-2 px-3 text-sm" aria-live="polite">
              <div>
                <dt className="text-muted-foreground">{t.common.rangeFrom}</dt>
                <dd className="font-medium">
                  {draft.from ? periodText(draft.from, draft.unit) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.common.rangeTo}</dt>
                <dd className="font-medium">{draft.to ? periodText(draft.to, draft.unit) : '—'}</dd>
              </div>
            </dl>
            {draft.unit === 'day' ? (
              <Calendar
                mode="range"
                locale={dayPickerLocale()}
                captionLayout="dropdown"
                selected={
                  draft.from
                    ? {
                        from: fromIsoDate(draft.from),
                        to: draft.to ? fromIsoDate(draft.to) : undefined,
                      }
                    : undefined
                }
                defaultMonth={fromIsoDate(from)}
                onSelect={(range) =>
                  model.selectDays(
                    range?.from ? toIsoDate(range.from) : null,
                    range?.to ? toIsoDate(range.to) : null,
                  )
                }
              />
            ) : (
              <div className="space-y-2 p-3 pt-0">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.pagination.previous}
                    onClick={() => model.move(-1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <span className="text-sm font-semibold tabular-nums">
                    {draft.unit === 'year' ? `${startYear} — ${startYear + 11}` : draft.year}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.pagination.next}
                    onClick={() => model.move(1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {options.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        option.value === draft.from || option.value === draft.to
                          ? 'default'
                          : option.value > (draft.from ?? '') && option.value < (draft.to ?? '')
                            ? 'secondary'
                            : 'outline'
                      }
                      aria-pressed={Boolean(
                        draft.from &&
                        option.value >= draft.from &&
                        option.value <= (draft.to ?? draft.from),
                      )}
                      onClick={() => model.select(option.value)}
                    >
                      {option.text}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t p-3">
              <Button type="button" variant="ghost" className="flex-1" onClick={onClear}>
                {labels.all}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!draft.from || !draft.to}
                onClick={() => {
                  const range = model.value();
                  if (range) onApply(range);
                }}
              >
                {t.common.apply}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
