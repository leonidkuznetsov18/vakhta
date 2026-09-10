import { dayPickerLocale, toIsoDate, fromIsoDate, fromIsoMonth } from '@/shared/lib/calendar-date';
import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormField } from '@/components/app/fields';
import { formatDate, formatMonth } from '@/lib/format';
import { cn } from 'cn';

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly minDate?: string;
  readonly maxDate?: string;
  readonly error?: string;
}

/** Calendar date field: the trigger is a labelled button, the popover holds the shadcn calendar. */
export function DateField({
  label,
  value,
  onChange,
  hint,
  className,
  disabled,
  minDate,
  maxDate,
  error,
}: FieldProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDate(value);
  return (
    <FormField label={label} hint={hint} className={className} error={error}>
      {(id) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
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
              autoFocus
              disabled={(day) =>
                (minDate ? toIsoDate(day) < minDate : false) ||
                (maxDate ? toIsoDate(day) > maxDate : false)
              }
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
