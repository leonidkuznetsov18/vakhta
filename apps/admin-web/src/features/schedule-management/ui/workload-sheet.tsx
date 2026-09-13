import { useState } from 'react';
import { monthDates } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { SelectField } from '@/components/app/fields';
import { DataTable } from '@/components/app/data-table';
import { InfoTip } from '@/components/app/info-tip';
import { CalendarDetailPanel } from '@/shared/ui/resource-calendar';
import type { Workspace } from '../model/use-workspace';
import { workloadModel } from '../model/workload';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;

/** Planned workload per worker for an explicit period and cohort (SC-35); no verdict, no actuals. */
export function WorkloadSheet({
  workspace: w,
  open,
  onClose,
  onRestoreFocus,
  weekDates,
}: {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
  readonly weekDates: readonly string[];
}) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const dates =
    period === 'week' ? weekDates.filter((date) => date.startsWith(w.month)) : monthDates(w.month);
  const summary = workloadModel({
    grid: w.grid,
    templates: w.templates,
    timezone: w.timezone,
    dates,
  });
  const periodLabel = `${dates[0] ?? ''} – ${dates.at(-1) ?? ''}`;
  const unitName = w.units.find((unit) => unit.id === w.orgUnitId)?.name ?? w.orgUnitId;
  const signed = (minutes: number) =>
    minutes === 0 ? '0' : `${minutes > 0 ? '+' : '−'}${formatDuration(Math.abs(minutes))}`;
  return (
    <CalendarDetailPanel
      open={open}
      title={t.workload}
      description={format(t.workloadCohort, {
        count: summary.cohortSize,
        unit: unitName,
        period: periodLabel,
      })}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t.period}
            value={period}
            onChange={(value) => setPeriod(value === 'month' ? 'month' : 'week')}
            options={[
              { value: 'week', label: t.visibleWeek },
              { value: 'month', label: t.wholeMonth },
            ]}
          />
          <InfoTip text={t.workloadHint} />
        </div>
        <p className="text-sm text-muted-foreground">
          {format(t.workloadAverage, {
            hours: formatDuration(summary.averageMinutes),
            shifts: String(summary.averageShifts),
          })}
        </p>
        <DataTable
          columns={[
            {
              key: 'employee',
              header: s.employee,
              cell: (row) => employeeLabel(w, row.employeeId),
            },
            {
              key: 'shifts',
              header: t.shiftsBreakdown,
              cell: (row) => `${row.shifts} (${row.nightShifts} · ${row.weekendShifts})`,
            },
            {
              key: 'hours',
              header: t.plannedHours,
              cell: (row) => formatDuration(row.plannedMinutes),
            },
            {
              key: 'breaks',
              header: t.breaksTotal,
              cell: (row) => formatDuration(row.breakMinutes),
            },
            { key: 'delta', header: t.vsAverage, cell: (row) => signed(row.deltaMinutes) },
          ]}
          rows={[...summary.rows].sort((a, b) => b.plannedMinutes - a.plannedMinutes)}
          rowKey={(row) => row.employeeId}
          empty={t.noWorkload}
          pageSize={20}
        />
        <p className="text-xs text-muted-foreground">{t.workloadPlannedOnly}</p>
      </div>
    </CalendarDetailPanel>
  );
}
