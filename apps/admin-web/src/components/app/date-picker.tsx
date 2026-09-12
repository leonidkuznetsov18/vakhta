import {
  dayPickerLocale,
  toIsoDate,
  fromIsoDate,
  fromIsoMonth,
  weekDateRange,
} from '@/shared/lib/calendar-date';
import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormField } from '@/components/app/fields';
import { formatDate, formatMonth } from '@/lib/format';
import { cn } from 'cn';
import { MonthCalendar } from '@/shared/ui/month-calendar';
import { WeekCalendar } from '@/shared/ui/week-calendar';

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
  selection = 'day',
}: FieldProps & { readonly selection?: 'day' | 'week' }) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDate(value);
  const monthEnd = selected
    ? toIsoDate(new Date(selected.getFullYear(), selected.getMonth() + 1, 0))
    : undefined;
  const range = weekDateRange(value, minDate ?? `${value.slice(0, 7)}-01`, maxDate ?? monthEnd);
  function choose(day: Date | undefined) {
    if (!day) return;
    onChange(toIsoDate(day));
    setOpen(false);
  }
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
              <span className="tabular-nums">
                {selection === 'week' && range
                  ? `${formatDate(toIsoDate(range.from))} – ${formatDate(toIsoDate(range.to))}`
                  : value
                    ? formatDate(value)
                    : '—'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            {selection === 'week' ? (
              <WeekCalendar
                value={value}
                minDate={minDate}
                maxDate={maxDate}
                onChange={(day) => {
                  onChange(day);
                  setOpen(false);
                }}
              />
            ) : (
              <Calendar
                autoFocus
                disabled={(day) =>
                  (minDate ? toIsoDate(day) < minDate : false) ||
                  (maxDate ? toIsoDate(day) > maxDate : false)
                }
                locale={dayPickerLocale()}
                captionLayout="dropdown"
                defaultMonth={selected}
                endMonth={
                  maxDate
                    ? fromIsoDate(maxDate)
                    : new Date((selected?.getFullYear() ?? new Date().getFullYear()) + 100, 11)
                }
                weekStartsOn={1}
                mode="single"
                selected={selected}
                onSelect={choose}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}

/** Month selection supports a compact month/year grid or the existing whole-month day preview. */
export function MonthField({
  label,
  value,
  onChange,
  hint,
  className,
  disabled,
  picker = 'days',
}: FieldProps & { readonly picker?: 'days' | 'months' }) {
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
            {picker === 'months' ? (
              <MonthCalendar
                value={value}
                onChange={(month) => {
                  onChange(month);
                  setOpen(false);
                }}
              />
            ) : (
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
            )}
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
