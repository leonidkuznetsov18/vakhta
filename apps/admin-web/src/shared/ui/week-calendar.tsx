import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatMonth } from '@/lib/format';
import { fromIsoDate, toIsoDate, weekDateRange } from '@/shared/lib/calendar-date';

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
  const month = toIsoDate(selected).slice(0, 7);
  const last = toIsoDate(new Date(selected.getFullYear(), selected.getMonth() + 1, 0));
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
      <p className="px-2 py-1 text-center text-sm font-medium">{formatMonth(month)}</p>
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
