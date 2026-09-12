import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import {
  ResourceCalendar,
  type CalendarItem,
  type CalendarSelection,
  type CalendarViewModel,
} from '@/shared/ui/resource-calendar';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { Paginator, usePages } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { useIsMobile } from '@/hooks/use-mobile';
import { currentLocale } from '@/i18n';

const DATES = Array.from({ length: 14 }, (_, index) =>
  new Date(Date.UTC(2026, 8, 28 + index)).toISOString().slice(0, 10),
);
const WORKERS = 500;
const ZONES = 20;
interface Entry {
  readonly id: string;
  readonly employee: number;
  readonly zone: number;
  readonly date: string;
}
const INITIAL: readonly Entry[] = DATES.flatMap((date) =>
  Array.from({ length: WORKERS }, (_, employee) => ({
    id: `${employee}:${date}`,
    employee,
    zone: employee % ZONES,
    date,
  })),
);

/** Deliberately synthetic, local-only spike. No production permission or time policy is implied. */
export function CalendarPrototype() {
  const t = messages(currentLocale()).scheduleWorkspace;
  const mobile = useIsMobile();
  const [entries, setEntries] = useState(INITIAL);
  const [grouping, setGrouping] = useState<'zones' | 'people'>('people');
  const [mode, setMode] = useState<'day' | 'week' | 'fortnight'>('week');
  const [date, setDate] = useState(DATES[0] ?? '2026-09-28');
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [target, setTarget] = useState(date);
  const [error, setError] = useState('');
  const selected = entries.find((item) => item.id === selection?.itemId);
  const dates = mode === 'day' ? [date] : mode === 'week' ? DATES.slice(0, 7) : DATES;
  const count = grouping === 'people' ? WORKERS : ZONES + 1;
  const buckets = new Map<string, CalendarItem[]>();
  const endDateFormat = new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  for (const entry of entries) {
    const resource = grouping === 'people' ? entry.employee : entry.zone;
    const key = `${resource}:${entry.date}`;
    const bucket = buckets.get(key) ?? [];
    const nextDay = new Date(`${entry.date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endDate = endDateFormat.format(nextDay);
    bucket.push({
      id: entry.id,
      title:
        grouping === 'people'
          ? `Zone ${entry.zone + 1}`
          : `Worker ${entry.employee + 1} · Long manufacturing employee name`,
      time: entry.employee % 2 ? `20:00–${endDate} 08:00 12 h` : '08:00–20:00 12 h',
      description: entry.employee % 2 ? t.nightShift : t.dayShift,
      status: t.current,
      tone: entry.employee % 2 ? 'indigo' : 'amber',
      ...(entry.employee === 0
        ? {
            parts: [
              { id: `${entry.id}:1`, label: `${t.segment} 1 · 08:00–12:00` },
              { id: `${entry.id}:2`, label: `${t.segment} 2 · 12:00–20:00` },
            ],
          }
        : {}),
    });
    buckets.set(key, bucket);
  }
  const model: CalendarViewModel = {
    label: t.calendar,
    resourceLabel: grouping === 'people' ? t.workers : t.zone,
    dates: dates.map((id) => ({ id, label: id, shortLabel: id.slice(8) })),
    emptyLabel: t.noAssignments,
    moreItemsLabel: t.resourceMoreItems,
    resources: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      title:
        grouping === 'people'
          ? `Worker ${index + 1} · Long manufacturing employee name`
          : `Zone ${index + 1}`,
      description: grouping === 'zones' ? t.coverageUnknown : `#${index + 1}`,
      cells: dates.map((day) => {
        const items = buckets.get(`${index}:${day}`) ?? [];
        return {
          date: day,
          label: day,
          items,
          summary: t.resourceItems.replace('{count}', String(items.length)),
          create: null,
        };
      }),
    })),
  };
  const selectedCell = model.resources
    .find((row) => row.id === selection?.resourceId)
    ?.cells.find((cell) => cell.date === selection?.date);
  const pages = usePages(
    selectedCell?.items.length ?? 0,
    10,
    undefined,
    -1,
    `${selection?.resourceId}:${selection?.date}`,
  );
  function pick(value: CalendarSelection) {
    setSelection(value);
    setTarget(value.date);
    setError('');
  }
  function move() {
    if (!selected || target === selected.date) return;
    if (
      entries.some(
        (entry) =>
          entry.id !== selected.id && entry.employee === selected.employee && entry.date === target,
      )
    ) {
      setError(t.conflict);
      return;
    }
    setEntries(
      entries.map((entry) => (entry.id === selected.id ? { ...entry, date: target } : entry)),
    );
    setDate(target);
    setMode('day');
    setSelection({
      resourceId: String(grouping === 'people' ? selected.employee : selected.zone),
      date: target,
      itemId: selected.id,
    });
    setError('');
  }
  return (
    <main className="min-w-0 p-4 pb-16 space-y-4">
      <h1 className="text-lg font-semibold">{t.prototype}</h1>
      <p className="text-sm">
        {t.workers}: {WORKERS} · {t.zones}: {ZONES} · {t.assigned}: {entries.length}
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <SelectField
          label={t.grouping}
          value={grouping}
          options={[
            { value: 'people', label: t.people },
            { value: 'zones', label: t.zones },
          ]}
          onChange={(value) => {
            if (value === 'people' || value === 'zones') {
              setGrouping(value);
              setSelection(null);
            }
          }}
        />
        <SelectField
          label={t.period}
          value={mode}
          options={[
            { value: 'day', label: t.day },
            { value: 'week', label: t.week },
            { value: 'fortnight', label: '14' },
          ]}
          onChange={(value) => {
            if (value === 'day' || value === 'week' || value === 'fortnight') setMode(value);
          }}
        />
      </div>
      <ResourceCalendar
        model={model}
        layout={mobile ? 'list' : 'grid'}
        selectedDate={date}
        selection={selection}
        onDate={setDate}
        onSelect={pick}
        onCreate={pick}
        detail={
          selection ? (
            <div className="space-y-3">
              <h2 className="font-semibold">
                {selected ? t.wholeAssignment : t.allItems} · {selection.date}
              </h2>
              {selected ? (
                <>
                  <p>
                    Worker {selected.employee + 1} · Zone {selected.zone + 1}
                  </p>
                  {selectedCell?.items
                    .find((item) => item.id === selected.id)
                    ?.parts?.map((part) => (
                      <p key={part.id}>{part.label}</p>
                    ))}
                  <DateField label={t.date} value={target} onChange={setTarget} />
                  <Feedback error={error || null} />
                  <Button disabled={target === selected.date} onClick={move}>
                    {t.move}
                  </Button>
                </>
              ) : (
                <>
                  <ul className="divide-y">
                    {selectedCell?.items
                      .slice((pages.page - 1) * pages.size, pages.page * pages.size)
                      .map((item) => (
                        <li key={item.id} className="py-2">
                          <Button
                            variant="ghost"
                            className="h-auto min-h-11 whitespace-normal text-left"
                            onClick={() => pick({ ...selection, itemId: item.id })}
                          >
                            {item.title} · {item.time}
                          </Button>
                        </li>
                      ))}
                  </ul>
                  <Paginator pages={pages} total={selectedCell?.items.length ?? 0} />
                </>
              )}
              <Button variant="outline" onClick={() => setSelection(null)}>
                {t.cancel}
              </Button>
            </div>
          ) : null
        }
      />
    </main>
  );
}
