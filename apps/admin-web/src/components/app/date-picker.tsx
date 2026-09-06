import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { enGB, ru, uk } from 'react-day-picker/locale';
import type { Locale } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormField } from '@/components/app/fields';
import { formatDate } from '@/lib/format';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

const DAY_PICKER_LOCALES = { uk, en: enGB, ru } as const;
const INTL_TAGS: Record<Locale, string> = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' };

function dayPickerLocale() {
  return DAY_PICKER_LOCALES[currentLocale()];
}

/** 'YYYY-MM-DD' in local time; dates from the API are calendar dates, not instants. */
function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromIsoDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function fromIsoMonth(value: string): Date | undefined {
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return undefined;
  return new Date(y, m - 1, 1);
}

function formatMonth(value: string): string {
  const d = fromIsoMonth(value);
  if (!d) return value;
  const text = d.toLocaleDateString(INTL_TAGS[currentLocale()], { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

/** Calendar date field: the trigger is a labelled button, the popover holds the shadcn calendar. */
export function DateField({ label, value, onChange, hint, className, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDate(value);
  return (
    <FormField label={label} hint={hint} className={className}>
      {(id) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground')}
            >
              <CalendarIcon aria-hidden="true" />
              <span className="tabular-nums">{value ? formatDate(value) : '—'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={dayPickerLocale()}
              captionLayout="dropdown"
              selected={selected}
              defaultMonth={selected}
              onSelect={(day) => {
                if (!day) return;
                onChange(toIsoDate(day));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}

/**
 * Month field on the same calendar: picking any day selects that month, and the whole month is
 * highlighted so the choice reads as a period, not a date.
 */
export function MonthField({ label, value, onChange, hint, className, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const first = fromIsoMonth(value);
  const last = first ? new Date(first.getFullYear(), first.getMonth() + 1, 0) : undefined;
  return (
    <FormField label={label} hint={hint} className={className}>
      {(id) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className="w-full justify-start font-normal"
            >
              <CalendarIcon aria-hidden="true" />
              <span>{formatMonth(value)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={dayPickerLocale()}
              captionLayout="dropdown"
              selected={first}
              defaultMonth={first}
              modifiers={first && last ? { period: { from: first, to: last } } : {}}
              modifiersClassNames={{ period: 'bg-accent text-accent-foreground' }}
              onSelect={(day) => {
                if (!day) return;
                onChange(toIsoDate(day).slice(0, 7));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
