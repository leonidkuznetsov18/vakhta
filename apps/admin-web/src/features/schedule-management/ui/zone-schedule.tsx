import { InfoTip } from '@/components/app/info-tip';
import type { AssignmentInput } from '@vakhta/contracts';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { SunIcon, MoonIcon, PlusIcon, PencilIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { DataTable, Paginator, usePages, type Column } from '@/components/app/data-table';
import { IconButton } from '@/shared/ui/icon-button';
import { formatDate, formatDuration } from '@/lib/format';
import type { Workspace } from '../model/use-workspace';
import { summarize, zoneRows, type ZoneRow } from '../model/planning';
import { employeeLabel } from './assignment-changes';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
const t = messages(currentLocale()).scheduleWorkspace;
export function ZoneSchedule({
  workspace: w,
  dates,
  zoneId,
  selectedDate,
  onDate,
  onAdd,
}: {
  workspace: Workspace;
  dates: readonly string[];
  zoneId: string;
  selectedDate: string;
  onDate: (date: string) => void;
  onAdd: (zone: string, date: string) => void;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const rows = zoneRows(w.grid, w.zones, dates).filter((row) => !zoneId || row.id === zoneId);
  const summary = summarize(
    rows.flatMap((row) => row.items),
    w.templates,
    w.timezone,
    w.recorded,
  );
  const columns: Column<ZoneRow>[] = [
    {
      key: 'zone',
      header: t.zone,
      minWidth: '12rem',
      cell: (row) => (
        <span className="block max-w-60 font-medium whitespace-normal break-words">
          {row.zone?.name ?? t.noZone}
        </span>
      ),
    },
    ...dates.map((date) => ({
      key: date,
      header: date.slice(8),
      label: formatDate(date),
      minWidth: '5.5rem',
      cell: (row: ZoneRow) => {
        const counts = summarize(
          row.items.filter((item) => item.businessDate === date),
          w.templates,
          w.timezone,
          w.recorded,
        );
        return (
          <Button
            variant={opened === row.id && selectedDate === date ? 'secondary' : 'ghost'}
            className="h-auto min-h-11 w-full flex-col gap-1 px-2 py-1 tabular-nums"
            aria-label={`${row.zone?.name ?? t.noZone}, ${date}, ${t.dayShift}: ${counts.day}, ${t.nightShift}: ${counts.night}`}
            onClick={(event) => {
              event.stopPropagation();
              setOpened(row.id);
              setEditor(null);
              onDate(date);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <SunIcon className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              {counts.day}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MoonIcon className="size-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
              {counts.night}
            </span>
          </Button>
        );
      },
    })),
    { key: 'total', header: t.assigned, align: 'right', cell: (row) => row.items.length },
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-lg border bg-muted/20 p-3 sm:flex sm:flex-wrap">
        {[
          { label: t.assigned, value: summary.assignments },
          { label: t.workers, value: summary.workers },
          { label: t.dayShift, value: summary.day },
          { label: t.nightShift, value: summary.night },
          {
            label: t.personHours,
            value: summary.minutes === null ? '—' : formatDuration(summary.minutes),
          },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t.period}: {formatDate(dates[0] ?? selectedDate)}
          {dates.length > 1 ? ` – ${formatDate(dates.at(-1) ?? selectedDate)}` : ''}
        </span>
        <InfoTip text={t.scopeHint} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        primaryKey="zone"
        rowLabel={(row) => row.zone?.name ?? t.noZone}
        empty={t.noAssignments}
        onRowClick={(row) => {
          setOpened(opened === row.id ? null : row.id);
          setEditor(null);
        }}
        activeKey={opened}
        storageKey="schedule.zones"
        expanded={(row) =>
          opened === row.id ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {row.zone?.name ?? t.noZone} · {formatDate(selectedDate)}
                </h3>
                {w.writable && row.zone?.isActive && (
                  <Button size="sm" onClick={() => onAdd(row.id, selectedDate)}>
                    <PlusIcon aria-hidden />
                    {t.add}
                  </Button>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {[false, true, undefined]
                  .filter(
                    (kind) =>
                      kind !== undefined ||
                      row.items.some(
                        (item) =>
                          item.businessDate === selectedDate &&
                          !w.templates.some((template) => template.id === item.templateId),
                      ),
                  )
                  .map((isNight) => {
                    const items = row.items.filter(
                      (item) =>
                        item.businessDate === selectedDate &&
                        w.templates.find((template) => template.id === item.templateId)?.isNight ===
                          isNight,
                    );
                    return (
                      <section
                        key={String(isNight)}
                        className="min-w-0 rounded-lg border p-3 space-y-3"
                      >
                        <h4 className="inline-flex items-center gap-2 font-semibold">
                          {isNight ? (
                            <MoonIcon className="size-4" aria-hidden />
                          ) : (
                            <SunIcon className="size-4" aria-hidden />
                          )}
                          {isNight === undefined
                            ? t.unknownShift
                            : isNight
                              ? t.nightShift
                              : t.dayShift}{' '}
                          <span className="text-muted-foreground tabular-nums">{items.length}</span>
                        </h4>
                        <ShiftPeople
                          items={items}
                          workspace={w}
                          onEdit={(item) => setEditor({ ...item, zoneId: item.zoneId ?? '' })}
                        />
                      </section>
                    );
                  })}
              </div>
              {editor && w.writable && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <AssignmentEditor
                    key={`${editor.employeeId}:${editor.businessDate}`}
                    workspace={w}
                    context={editor}
                    onClose={() => setEditor(null)}
                  />
                </div>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}

function ShiftPeople({
  items,
  workspace: w,
  onEdit,
}: {
  items: readonly AssignmentInput[];
  workspace: Workspace;
  onEdit: (item: AssignmentInput) => void;
}) {
  const pages = usePages(items.length, 10);
  const visible = items.slice((pages.page - 1) * pages.size, pages.page * pages.size);
  return (
    <div className="space-y-2">
      <ul className="divide-y">
        {visible.map((item) => {
          const template = w.templates.find((value) => value.id === item.templateId);
          return (
            <li
              key={`${item.employeeId}:${item.businessDate}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{employeeLabel(w, item.employeeId)}</p>
                <p className="text-sm text-muted-foreground">
                  {template ? `${template.localStart}–${template.localEnd}` : t.unknownTemplate}
                </p>
              </div>
              {w.writable && (
                <IconButton
                  size="icon-sm"
                  variant="outline"
                  icon={PencilIcon}
                  label={t.editAssignment}
                  tooltip={t.editAssignment}
                  onClick={() => onEdit(item)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {!items.length && <p className="text-sm text-muted-foreground">{t.noAssignments}</p>}
      <Paginator pages={pages} total={items.length} />
    </div>
  );
}
