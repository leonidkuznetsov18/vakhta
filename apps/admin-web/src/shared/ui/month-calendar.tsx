import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { IconButton } from './icon-button';

const YEAR_WINDOW = 100;

/** Month/year selection without day cells; the field owns committing and closing. */
export function MonthCalendar({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (month: string) => void;
}) {
  const selectedYear = Number(value.slice(0, 4)) || new Date().getFullYear();
  const [year, setYear] = useState(selectedYear);
  const t = messages(currentLocale()).ui.common;
  const formatter = new Intl.DateTimeFormat(currentLocale(), { month: 'short' });
  const firstYear = Math.max(1, Math.min(selectedYear, year) - YEAR_WINDOW);
  const lastYear = Math.min(9999, Math.max(selectedYear, year) + YEAR_WINDOW);
  return (
    <div className="w-72 space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton
          size="icon"
          variant="ghost"
          icon={ChevronLeftIcon}
          label={t.calendarPreviousYear}
          tooltip={t.calendarPreviousYear}
          disabled={year <= 1}
          onClick={() => setYear(year - 1)}
        />
        <NativeSelect
          aria-label={t.calendarYear}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map(
            (item) => (
              <NativeSelectOption key={item} value={item}>
                {item}
              </NativeSelectOption>
            ),
          )}
        </NativeSelect>
        <IconButton
          size="icon"
          variant="ghost"
          icon={ChevronRightIcon}
          label={t.calendarNextYear}
          tooltip={t.calendarNextYear}
          disabled={year >= 9999}
          onClick={() => setYear(year + 1)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, month) => {
          const id = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
          return (
            <Button
              key={id}
              variant={id === value ? 'default' : 'ghost'}
              aria-pressed={id === value}
              className="min-h-11 capitalize"
              onClick={() => onChange(id)}
            >
              {formatter.format(new Date(2000, month, 1))}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
