import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { fromIsoDate, fromIsoMonth, toIsoDate, weekDateRange } from '@/shared/lib/calendar-date';

/** A week is the only selectable unit. Bounds reflect the caller's loaded calendar scope. */
export function WeekCalendar({
  value,
  minDate,
  maxDate,
  onChange,
}: {
  readonly value: string;
  readonly minDate?: string;
  readonly maxDate?: string;
  readonly onChange: (value: string) => void;
}) {
  const selected = fromIsoDate(value) ?? new Date();
  const [month, setMonth] = useState(toIsoDate(selected).slice(0, 7));
  const displayed = fromIsoMonth(month) ?? selected;
  const year = displayed.getFullYear();
  const t = messages(currentLocale()).ui.common;
  const monthFormat = new Intl.DateTimeFormat(currentLocale(), { month: 'long' });
  const last = toIsoDate(new Date(year, displayed.getMonth() + 1, 0));
  const minimum = minDate && minDate > `${month}-01` ? minDate : `${month}-01`;
  const maximum = maxDate && maxDate < last ? maxDate : last;
  const weeks = [];
  let cursor = minimum;
  while (cursor <= maximum) {
    const range = weekDateRange(cursor, minimum, maximum);
    if (!range) break;
    const from = toIsoDate(range.from);
    const to = toIsoDate(range.to);
    weeks.push({ from, to });
    const next = new Date(range.to);
    next.setDate(next.getDate() + 1);
    cursor = toIsoDate(next);
  }
  return (
    <div className="w-72 space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <NativeSelect
          aria-label={t.calendarMonth}
          value={month.slice(5)}
          onChange={(event) => setMonth(`${year}-${event.target.value}`)}
        >
          {Array.from({ length: 12 }, (_, index) => {
            const id = String(index + 1).padStart(2, '0');
            return (
              <NativeSelectOption key={id} value={id}>
                {monthFormat.format(new Date(2000, index, 1))}
              </NativeSelectOption>
            );
          })}
        </NativeSelect>
        <NativeSelect
          aria-label={t.calendarYear}
          value={year}
          onChange={(event) => setMonth(`${event.target.value}-${month.slice(5)}`)}
        >
          {Array.from({ length: 201 }, (_, index) => year - 100 + index).map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        {weeks.map(({ from, to }) => {
          const active = value >= from && value <= to;
          return (
            <Button
              key={from}
              variant={active ? 'default' : 'ghost'}
              aria-pressed={active}
              className="min-h-11 justify-between gap-3 tabular-nums"
              onClick={() => onChange(from)}
            >
              <span>
                {formatDate(from)} – {formatDate(to)}
              </span>
              {active && <CheckIcon aria-hidden className="size-4" />}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
