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
  formatNearDate,
  formatDayMonth,
  machineLabel,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { DateField, MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { Section, Toolbar } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrg } from '@/lib/org';
import { usePersistentState } from '@/lib/ui-store';
import { IconButton } from '@/shared/ui/icon-button';
import { currentLocale } from '@/shared/config';
import { cn } from 'cn';
import {
  CalendarView,
  EntryKind,
  EntryTone,
  STATUS_FILTERS,
  StatusFilter,
  entriesByDay,
  filterEntries,
  shiftMonth,
  shiftWeek,
  viewDays,
  weekStart,
  type CalendarEntry,
  type GridDay,
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
        <span className="shrink-0 font-medium whitespace-nowrap">
          {entry.forecast.equipmentCode}
        </span>
        <span data-title="" className="truncate">
          {entry.forecast.title}
        </span>
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
      <span className="shrink-0 font-medium whitespace-nowrap">{item.equipmentCode}</span>
      <span data-title="" className="truncate">
        {item.title}
      </span>
    </button>
  );
}

type DayMap = ReadonlyMap<string, readonly CalendarEntry[]>;

function CalendarGrid({
  days,
  today,
  tall,
  byDay,
  onOpenWork,
}: {
  readonly days: readonly GridDay[];
  readonly today: string;
  /** A week has room for every entry of a day. */
  readonly tall: boolean;
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
      {days.map((day) => (
        <div
          key={day.date}
          role="gridcell"
          className={cn(
            'flex min-w-0 flex-col gap-1 border-r border-b p-1 [&:nth-child(7n)]:border-r-0',
            // A week has room for whole titles; the month keeps one line per entry.
            tall
              ? 'min-h-64 [&_[data-title]]:text-left [&_[data-title]]:whitespace-normal [&_button]:items-start'
              : 'min-h-24',
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
            {tall ? formatDayMonth(day.date) : Number(day.date.slice(8))}
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
  days,
  byDay,
  empty,
  onOpenWork,
}: {
  readonly days: readonly GridDay[];
  readonly byDay: DayMap;
  readonly empty: string;
  readonly onOpenWork: (id: string) => void;
}) {
  const shown = days.filter((day) => day.inMonth && byDay.has(day.date));
  if (!shown.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {shown.map((day) => (
        <li key={day.date} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {formatNearDate(day.date)}
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
                machine: machineLabel({
                  code: item.equipmentCode,
                  model: item.equipmentModel,
                  name: item.equipmentName,
                }),
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

/** Explains only the marks the calendar currently shows. */
function Legend({ byDay }: { readonly byDay: ReadonlyMap<string, readonly CalendarEntry[]> }) {
  const shown = new Set<EntryTone>();
  for (const entries of byDay.values()) for (const entry of entries) shown.add(entry.tone);
  const tones = LEGEND.filter((tone) => shown.has(tone));
  if (!tones.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {tones.map((tone) => (
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

// Two filters per row on a phone, one compact row on a desktop.
const FILTER_WIDTH = 'w-[calc(50%-0.375rem)] md:w-44';

interface Filters {
  readonly view: CalendarView;
  readonly month: string;
  readonly weekOf: string;
  readonly unitId: string;
  readonly mechanicId: string;
  readonly equipmentId: string;
  readonly status: StatusFilter;
}

const VIEWS = new Set<string>(Object.values(CalendarView));
const STATUSES = new Set<string>(STATUS_FILTERS);

function isView(value: string): value is CalendarView {
  return VIEWS.has(value);
}

function isStatus(value: string): value is StatusFilter {
  return STATUSES.has(value);
}

function PeriodControls({
  filters,
  onChange,
}: {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
}) {
  const t = maintenanceMessages().calendar;
  const week = filters.view === CalendarView.WEEK;
  const step = (direction: number) =>
    onChange(
      week
        ? { ...filters, weekOf: shiftWeek(filters.weekOf, direction) }
        : { ...filters, month: shiftMonth(filters.month, direction) },
    );
  return (
    <div className="flex items-end gap-1 max-md:w-full">
      <IconButton
        icon={ChevronLeftIcon}
        label={week ? t.previousWeek : t.previous}
        tooltip={week ? t.previousWeek : t.previous}
        variant="outline"
        size="icon"
        onClick={() => step(-1)}
      />
      {week ? (
        <DateField
          label={t.week}
          value={filters.weekOf}
          selection="week"
          onChange={(weekOf) => onChange({ ...filters, weekOf: weekStart(weekOf) })}
        />
      ) : (
        <MonthField
          label={messages(currentLocale()).ui.common.calendarMonth}
          value={filters.month}
          onChange={(month) => onChange({ ...filters, month })}
          picker="months"
        />
      )}
      <IconButton
        icon={ChevronRightIcon}
        label={week ? t.nextWeek : t.next}
        tooltip={week ? t.nextWeek : t.next}
        variant="outline"
        size="icon"
        onClick={() => step(1)}
      />
    </div>
  );
}

function ViewToggle({
  filters,
  onChange,
}: {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
}) {
  const t = maintenanceMessages().calendar;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={t.view}
      value={filters.view}
      onValueChange={(value) => (isView(value) ? onChange({ ...filters, view: value }) : undefined)}
    >
      <ToggleGroupItem value={CalendarView.MONTH}>{t.viewMonth}</ToggleGroupItem>
      <ToggleGroupItem value={CalendarView.WEEK}>{t.viewWeek}</ToggleGroupItem>
    </ToggleGroup>
  );
}

function CalendarToolbar({
  filters,
  onChange,
}: {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
}) {
  const t = maintenanceMessages();
  const { orgOrEmpty } = useOrg();
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const machines = useQuery(maintenanceQueries.equipmentList({ archived: false }));
  return (
    <Toolbar>
      <PeriodControls filters={filters} onChange={onChange} />
      <SelectField
        label={t.form.unit}
        value={filters.unitId}
        onChange={(unitId) => onChange({ ...filters, unitId })}
        className={FILTER_WIDTH}
        options={[
          { value: '', label: t.calendar.allUnits },
          ...orgOrEmpty.orgUnits.map((unit) => ({ value: unit.id, label: unit.name })),
        ]}
      />
      <SelectField
        label={t.work.columns.mechanic}
        value={filters.mechanicId}
        onChange={(mechanicId) => onChange({ ...filters, mechanicId })}
        className={FILTER_WIDTH}
        options={[
          { value: '', label: t.calendar.allMechanics },
          ...(mechanics.data ?? []).map((option) => ({ value: option.id, label: option.fullName })),
        ]}
      />
      <SelectField
        label={t.work.columns.machine}
        value={filters.equipmentId}
        onChange={(equipmentId) => onChange({ ...filters, equipmentId })}
        className={FILTER_WIDTH}
        options={[
          { value: '', label: t.calendar.allMachines },
          ...(machines.data ?? []).map((machine) => ({
            value: machine.id,
            label: machineLabel(machine),
          })),
        ]}
      />
      <SelectField
        label={t.calendar.status}
        value={filters.status}
        onChange={(status) =>
          onChange({ ...filters, status: isStatus(status) ? status : StatusFilter.ALL })
        }
        className={FILTER_WIDTH}
        searchable={false}
        options={STATUS_FILTERS.map((value) => ({ value, label: t.calendar.statusFilter[value] }))}
      />
    </Toolbar>
  );
}

function calendarQuery(filters: Filters, days: readonly GridDay[]) {
  return maintenanceQueries.calendar({
    from: days[0]?.date ?? `${filters.month}-01`,
    to: days.at(-1)?.date ?? `${filters.month}-28`,
    ...(filters.unitId ? { unitId: filters.unitId } : {}),
    ...(filters.mechanicId ? { mechanicId: filters.mechanicId } : {}),
    ...(filters.equipmentId ? { equipmentId: filters.equipmentId } : {}),
  });
}

/** Stored choices restored only when still valid (table-filter standard F4). */
function useCalendarFilters(today: string): [Filters, (filters: Filters) => void] {
  const { orgOrEmpty } = useOrg();
  const [stored, setStored] = usePersistentState<Partial<Filters>>('maintenance.calendar', {});
  // Both views open on the current period: this month, the week holding today.
  const [period, setPeriod] = useState({ month: today.slice(0, 7), weekOf: weekStart(today) });
  const units = new Set(orgOrEmpty.orgUnits.map((unit) => unit.id));
  const filters: Filters = {
    ...period,
    view: stored.view && isView(stored.view) ? stored.view : CalendarView.MONTH,
    status: stored.status && isStatus(stored.status) ? stored.status : StatusFilter.ALL,
    unitId: stored.unitId && units.has(stored.unitId) ? stored.unitId : '',
    mechanicId: stored.mechanicId ?? '',
    equipmentId: stored.equipmentId ?? '',
  };
  const change = (next: Filters) => {
    setPeriod({ month: next.month, weekOf: next.weekOf });
    setStored({
      view: next.view,
      status: next.status,
      unitId: next.unitId,
      mechanicId: next.mechanicId,
      equipmentId: next.equipmentId,
    });
  };
  return [filters, change];
}

/** The maintenance calendar (spec 014, US4): the month or week of work, the forecast, what is late. */
export function MaintenanceCalendar({
  today,
  onOpenWork,
}: {
  /** The panel's local day; the site's own day comes with the calendar data. */
  readonly today: string;
  readonly onOpenWork: (id: string) => void;
}) {
  const t = maintenanceMessages().calendar;
  const [filters, setFilters] = useCalendarFilters(today);
  const mobile = useIsMobile();
  const days = viewDays(filters.view, filters);
  const query = useQuery(calendarQuery(filters, days));
  const view = query.data;
  const all = view ? entriesByDay(view, currentLocale()) : new Map<string, CalendarEntry[]>();
  const byDay = filterEntries(all, filters.status);
  const empty = filters.status === StatusFilter.ALL ? t.empty : t.emptyFiltered;
  return (
    <div className="flex flex-col gap-4">
      {view ? <OverdueAlert items={view.overdue} /> : null}
      <Section title={t.title} actions={<ViewToggle filters={filters} onChange={setFilters} />}>
        <CalendarToolbar filters={filters} onChange={setFilters} />
        <QueryFeedback query={query} />
        {view && mobile ? (
          <CalendarAgenda days={days} byDay={byDay} empty={empty} onOpenWork={onOpenWork} />
        ) : null}
        {view && !mobile ? (
          <CalendarGrid
            days={days}
            today={view.today}
            tall={filters.view === CalendarView.WEEK}
            byDay={byDay}
            onOpenWork={onOpenWork}
          />
        ) : null}
        <Legend byDay={byDay} />
      </Section>
    </div>
  );
}
