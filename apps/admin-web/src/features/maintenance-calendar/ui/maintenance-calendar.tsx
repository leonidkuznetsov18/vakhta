import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  ClockIcon,
  PackageIcon,
  SirenIcon,
  WrenchIcon,
} from 'lucide-react';
import type { CalendarItem } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import {
  formatBusinessDate,
  formatDayMonth,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { Section, Toolbar } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsMobile } from '@/hooks/use-mobile';
import { IconButton } from '@/shared/ui/icon-button';
import { currentLocale } from '@/shared/config';
import { cn } from 'cn';
import {
  EntryKind,
  EntryTone,
  entriesByDay,
  gridRange,
  monthGrid,
  shiftMonth,
  type CalendarEntry,
} from '../model/month-grid';

const TONE_CLASS: Readonly<Record<EntryTone, string>> = {
  PLANNED:
    'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-100',
  MISSING:
    'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100',
  OVERDUE:
    'border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100',
  EMERGENCY:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  // Emerald marks today on this screen, so completed work stays a calm slate.
  DONE: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  FORECAST: 'border-dotted border-muted-foreground/50 bg-transparent text-muted-foreground',
};

const TONE_ICON: Readonly<Record<EntryTone, ReactNode>> = {
  PLANNED: <WrenchIcon className="size-3 shrink-0" aria-hidden="true" />,
  MISSING: <PackageIcon className="size-3 shrink-0" aria-hidden="true" />,
  OVERDUE: <ClockIcon className="size-3 shrink-0" aria-hidden="true" />,
  EMERGENCY: <SirenIcon className="size-3 shrink-0" aria-hidden="true" />,
  DONE: <CheckIcon className="size-3 shrink-0" aria-hidden="true" />,
  FORECAST: <CircleDashedIcon className="size-3 shrink-0" aria-hidden="true" />,
};

function legendText(tone: EntryTone): string {
  const t = maintenanceMessages().calendar;
  const labels: Readonly<Record<EntryTone, string>> = {
    PLANNED: t.legendPlanned,
    MISSING: t.legendMissing,
    OVERDUE: maintenanceMessages().equipment.overdue,
    EMERGENCY: t.legendEmergency,
    DONE: t.legendDone,
    FORECAST: t.legendForecast,
  };
  return labels[tone];
}

function EntryChip({
  entry,
  onOpenWork,
}: {
  readonly entry: CalendarEntry;
  readonly onOpenWork: (id: string) => void;
}) {
  const base = cn(
    'flex w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-xs',
    TONE_CLASS[entry.tone],
  );
  if (entry.kind === EntryKind.FORECAST)
    return (
      <span className={base}>
        {TONE_ICON[entry.tone]}
        <span className="sr-only">{legendText(entry.tone)}:</span>
        <span className="font-medium">{entry.forecast.equipmentCode}</span>
        <span className="truncate">{entry.forecast.title}</span>
      </span>
    );
  const item = entry.item;
  return (
    <button
      type="button"
      className={cn(
        base,
        'hover:ring-2 hover:ring-sky-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
      aria-label={`${legendText(entry.tone)}: ${item.equipmentCode} ${item.title}, ${item.assignee}`}
      onClick={() => onOpenWork(item.workOrderId)}
    >
      {TONE_ICON[entry.tone]}
      <span className="font-medium">{item.equipmentCode}</span>
      <span className="truncate">{item.title}</span>
    </button>
  );
}

type DayMap = ReadonlyMap<string, readonly CalendarEntry[]>;

function CalendarGrid({
  month,
  today,
  byDay,
  onOpenWork,
}: {
  readonly month: string;
  readonly today: string;
  readonly byDay: DayMap;
  readonly onOpenWork: (id: string) => void;
}) {
  const t = maintenanceMessages().calendar;
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm" role="grid">
      {t.weekdays.map((weekday) => (
        <div
          key={weekday}
          role="columnheader"
          className="border-b bg-muted/50 px-2 py-1 text-xs font-medium"
        >
          {weekday}
        </div>
      ))}
      {monthGrid(month).map((day) => (
        <div
          key={day.date}
          role="gridcell"
          className={cn(
            'flex min-h-24 min-w-0 flex-col gap-1 border-r border-b p-1 [&:nth-child(7n)]:border-r-0',
            !day.inMonth && 'bg-muted/30',
          )}
        >
          <span
            className={cn(
              'self-start rounded px-1 text-xs tabular-nums',
              day.inMonth ? 'font-medium' : 'text-muted-foreground',
              day.date === today && 'bg-emerald-600 text-white',
            )}
          >
            {Number(day.date.slice(8))}
          </span>
          {(byDay.get(day.date) ?? []).map((entry) => (
            <EntryChip key={entry.key} entry={entry} onOpenWork={onOpenWork} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarAgenda({
  month,
  byDay,
  onOpenWork,
}: {
  readonly month: string;
  readonly byDay: DayMap;
  readonly onOpenWork: (id: string) => void;
}) {
  const t = maintenanceMessages().calendar;
  const days = monthGrid(month).filter((day) => day.inMonth && byDay.has(day.date));
  if (!days.length) return <p className="text-sm text-muted-foreground">{t.empty}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {days.map((day) => (
        <li key={day.date} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {formatBusinessDate(day.date)}
          </span>
          {(byDay.get(day.date) ?? []).map((entry) => (
            <EntryChip key={entry.key} entry={entry} onOpenWork={onOpenWork} />
          ))}
        </li>
      ))}
    </ol>
  );
}

function OverdueAlert({ items }: { readonly items: readonly CalendarItem[] }) {
  const t = maintenanceMessages().calendar;
  if (!items.length) return null;
  return (
    <Alert className="border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200">
      <ClockIcon />
      <AlertTitle>{format(t.overdueTitle, { count: items.length })}</AlertTitle>
      <AlertDescription>
        <ul>
          {items.map((item) => (
            <li key={item.workOrderId}>
              {format(t.overdueLine, {
                code: item.equipmentCode,
                title: item.title,
                date: formatDayMonth(item.dueOn),
                mechanic: item.assignee,
              })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

const LEGEND: readonly EntryTone[] = [
  EntryTone.PLANNED,
  EntryTone.MISSING,
  EntryTone.OVERDUE,
  EntryTone.EMERGENCY,
  EntryTone.DONE,
  EntryTone.FORECAST,
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {LEGEND.map((tone) => (
        <span key={tone} className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded border',
              TONE_CLASS[tone],
            )}
          >
            {TONE_ICON[tone]}
          </span>
          {legendText(tone)}
        </span>
      ))}
    </div>
  );
}

interface Filters {
  readonly month: string;
  readonly mechanicId: string;
  readonly equipmentId: string;
}

function CalendarToolbar({
  filters,
  onChange,
}: {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
}) {
  const t = maintenanceMessages();
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const machines = useQuery(maintenanceQueries.equipmentList({ archived: false }));
  const month = (next: string) => onChange({ ...filters, month: next });
  return (
    <Toolbar>
      <div className="flex items-end gap-1">
        <IconButton
          icon={ChevronLeftIcon}
          label={t.calendar.previous}
          tooltip={t.calendar.previous}
          variant="outline"
          size="icon"
          onClick={() => month(shiftMonth(filters.month, -1))}
        />
        <MonthField
          label={messages(currentLocale()).ui.common.calendarMonth}
          value={filters.month}
          onChange={month}
          picker="months"
        />
        <IconButton
          icon={ChevronRightIcon}
          label={t.calendar.next}
          tooltip={t.calendar.next}
          variant="outline"
          size="icon"
          onClick={() => month(shiftMonth(filters.month, 1))}
        />
      </div>
      <SelectField
        label={t.work.columns.mechanic}
        value={filters.mechanicId}
        onChange={(mechanicId) => onChange({ ...filters, mechanicId })}
        className="w-48"
        options={[
          { value: '', label: t.calendar.allMechanics },
          ...(mechanics.data ?? []).map((option) => ({ value: option.id, label: option.fullName })),
        ]}
      />
      <SelectField
        label={t.work.columns.machine}
        value={filters.equipmentId}
        onChange={(equipmentId) => onChange({ ...filters, equipmentId })}
        className="w-48"
        options={[
          { value: '', label: t.calendar.allMachines },
          ...(machines.data ?? []).map((machine) => ({
            value: machine.id,
            label: `${machine.code} ${machine.name}`,
          })),
        ]}
      />
    </Toolbar>
  );
}

function calendarQuery(filters: Filters) {
  return maintenanceQueries.calendar({
    ...gridRange(filters.month),
    ...(filters.mechanicId ? { mechanicId: filters.mechanicId } : {}),
    ...(filters.equipmentId ? { equipmentId: filters.equipmentId } : {}),
  });
}

/** The maintenance calendar (spec 014, US4): the month of work, the forecast and what is late. */
export function MaintenanceCalendar({
  initialMonth,
  onOpenWork,
}: {
  readonly initialMonth: string;
  readonly onOpenWork: (id: string) => void;
}) {
  const t = maintenanceMessages().calendar;
  const [filters, setFilters] = useState<Filters>({
    month: initialMonth,
    mechanicId: '',
    equipmentId: '',
  });
  const mobile = useIsMobile();
  const query = useQuery(calendarQuery(filters));
  const view = query.data;
  const byDay = view ? entriesByDay(view, currentLocale()) : new Map<string, CalendarEntry[]>();
  const month = filters.month;
  return (
    <div className="flex flex-col gap-4">
      {view ? <OverdueAlert items={view.overdue} /> : null}
      <Section title={t.title}>
        <CalendarToolbar filters={filters} onChange={setFilters} />
        <QueryFeedback query={query} />
        {view && mobile ? (
          <CalendarAgenda month={month} byDay={byDay} onOpenWork={onOpenWork} />
        ) : null}
        {view && !mobile ? (
          <CalendarGrid month={month} today={view.today} byDay={byDay} onOpenWork={onOpenWork} />
        ) : null}
        <Legend />
      </Section>
    </div>
  );
}
