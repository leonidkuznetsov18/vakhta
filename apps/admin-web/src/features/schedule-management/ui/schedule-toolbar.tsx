import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/app/fields';
import { MonthField, DateField } from '@/components/app/date-picker';
import { IconButton } from '@/shared/ui/icon-button';
import { StateFilter } from '@/shared/ui/state-filter';
import type { PeriodMode } from '../model/planning';
import { addDays } from '../model/business-dates';
import type { CalendarGrouping } from '../model/calendar';

const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;

/** Scope, period and grouping controls of the planning workspace; actions live beside them. */
export function ScheduleToolbar({
  sites,
  siteId,
  onSite,
  units,
  orgUnitId,
  onUnit,
  scopeDisabled,
  zones,
  zoneId,
  onZone,
  mode,
  modes,
  onMode,
  grouping,
  onGrouping,
  month,
  onMonth,
  date,
  onDate,
  today,
  busy,
  children,
}: {
  readonly sites: readonly { readonly id: string; readonly name: string }[];
  readonly siteId: string;
  readonly onSite: (value: string) => void;
  readonly units: readonly { readonly id: string; readonly name: string }[];
  readonly orgUnitId: string;
  readonly onUnit: (value: string) => void;
  readonly scopeDisabled: boolean;
  readonly zones: readonly { readonly id: string; readonly name: string }[];
  readonly zoneId: string;
  readonly onZone: (value: string) => void;
  readonly mode: PeriodMode;
  readonly modes: readonly PeriodMode[];
  readonly onMode: (mode: PeriodMode) => void;
  readonly grouping: CalendarGrouping;
  readonly onGrouping: (grouping: CalendarGrouping) => void;
  readonly month: string;
  readonly onMonth: (month: string) => void;
  readonly date: string;
  readonly onDate: (date: string) => void;
  readonly today: string;
  readonly busy: boolean;
  readonly children?: React.ReactNode;
}) {
  // Navigation crosses month and year boundaries; the owner of the target month loads on arrival.
  const step = mode === 'week' ? 7 : 1;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {sites.length > 1 && (
        <SelectField
          label={s.site}
          value={siteId}
          onChange={onSite}
          disabled={scopeDisabled}
          options={sites.map((site) => ({ value: site.id, label: site.name }))}
          className="min-w-0 flex-1 basis-40 sm:flex-none sm:w-48"
        />
      )}
      <SelectField
        label={s.orgUnit}
        value={orgUnitId}
        onChange={onUnit}
        disabled={scopeDisabled}
        options={units.map((unit) => ({ value: unit.id, label: unit.name }))}
        className="min-w-0 flex-1 basis-40 sm:flex-none sm:w-56"
      />
      <SelectField
        label={t.zone}
        value={zoneId}
        onChange={onZone}
        options={[
          { value: '', label: t.allZones },
          ...zones.map((item) => ({ value: item.id, label: item.name })),
        ]}
        className="min-w-0 flex-1 basis-40 sm:flex-none sm:w-52"
      />
      <div className="flex min-w-0 items-end gap-1">
        {mode !== 'month' && (
          <IconButton
            size="icon"
            variant="outline"
            icon={ChevronLeftIcon}
            label={t.previous}
            tooltip={t.previous}
            disabled={busy}
            onClick={() => onDate(addDays(date, -step))}
          />
        )}
        {mode === 'month' ? (
          <MonthField
            picker="months"
            label={s.month}
            value={month}
            onChange={onMonth}
            disabled={busy}
            className="min-w-0 w-44 sm:w-52"
          />
        ) : (
          <DateField
            selection={mode === 'week' ? 'week' : 'day'}
            label={mode === 'week' ? t.week : t.date}
            disabled={busy}
            value={date}
            onChange={onDate}
            className="min-w-0 w-44 sm:w-56"
          />
        )}
        {mode !== 'month' && (
          <IconButton
            size="icon"
            variant="outline"
            icon={ChevronRightIcon}
            label={t.next}
            tooltip={t.next}
            disabled={busy}
            onClick={() => onDate(addDays(date, step))}
          />
        )}
        {mode !== 'month' && (
          <Button
            variant="outline"
            disabled={busy || date === today}
            onClick={() => {
              if (date !== today) onDate(today);
            }}
          >
            {t.today}
          </Button>
        )}
      </div>
      <StateFilter
        label={t.period}
        value={mode}
        onChange={onMode}
        options={modes.map((value) => ({ value, label: t[value] }))}
      />
      {mode !== 'month' && (
        <StateFilter
          label={t.grouping}
          value={grouping}
          onChange={onGrouping}
          options={[
            { value: 'zones', label: t.zones },
            { value: 'people', label: t.people },
          ]}
        />
      )}
      {children && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}
