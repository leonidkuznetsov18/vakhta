import { assignmentAcknowledgement } from '../model/acknowledgement';
import { templateLabel } from '../lib/template-label';
import { Trash2Icon } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { monthDates } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { TableSearch } from '@/shared/ui/table-search';
import { Paginator, RowMenu, usePages } from '@/components/app/data-table';
import {
  CalendarDetailPanel,
  calendarItemColors,
  calendarInteraction,
} from '@/shared/ui/resource-calendar';
import { InfoTip } from '@/components/app/info-tip';
import { formatDuration } from '@/lib/format';
import { cn } from 'cn';
import type { Workspace } from '../model/use-workspace';
import {
  gridToItems,
  gridForZone,
  removeZoneAssignments,
  setAssignment,
  setCell,
  removeRow,
} from '../model/grid';
import { summarize } from '../model/planning';
import { calendarModel } from '../model/calendar';
import { employeeLabel } from './assignment-changes';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
const t = messages(currentLocale()).scheduleWorkspace;
const dayKinds = messages(currentLocale()).schedule.dayKinds;
export function PeopleSchedule({
  workspace: w,
  zoneId = '',
}: {
  workspace: Workspace;
  zoneId?: string;
}) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const [focus, setFocus] = useState('');
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const instance = useId();
  const days = monthDates(w.month);
  const allItems = gridToItems(w.grid);
  const projected = gridForZone(w.grid, zoneId);
  const rows = projected.rows.filter((row) =>
    employeeLabel(w, row.employeeId)
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const pages = usePages(rows.length, 20, 'schedule.people', -1, `${w.month}:${search}:${zoneId}`);
  const visible = rows.slice((pages.page - 1) * pages.size, pages.page * pages.size);
  const first =
    visible.flatMap((row) =>
      days
        .filter((date) => !outsideZone(row.employeeId, date) && (w.writable || !!row.cells[date]))
        .map((date) => `${row.employeeId}:${date}`),
    )[0] ?? '';
  const focusKey = visible.some((row) =>
    days.some(
      (date) =>
        `${row.employeeId}:${date}` === focus &&
        !outsideZone(row.employeeId, date) &&
        (w.writable || !!row.cells[date]),
    ),
  )
    ? focus
    : first;
  const acknowledgement = assignmentAcknowledgement({
    assignment: allItems.find(
      (item) =>
        item.employeeId === editor?.employeeId && item.businessDate === editor?.businessDate,
    ),
    recorded: w.recorded,
    version: w.version,
    timezone: w.timezone,
  });
  const readOnlyDetails =
    editor && !w.writable
      ? calendarModel({
          ...w,
          dates: [editor.businessDate],
          grouping: 'people',
          locale: currentLocale(),
          publication: w.version
            ? messages(currentLocale()).admin.schedule.statuses[w.version.status]
            : '',
        }).resources.find((row) => row.id === editor.employeeId)?.cells[0]?.items[0]
      : null;
  function outsideZone(employeeId: string, date: string) {
    return (
      !!zoneId &&
      allItems.some(
        (item) =>
          item.employeeId === employeeId && item.businessDate === date && item.zoneId !== zoneId,
      )
    );
  }
  function open(
    employeeId: string,
    businessDate: string,
    trigger: HTMLElement,
    templateId?: string,
  ) {
    if (outsideZone(employeeId, businessDate)) return;
    setTrigger(trigger);
    const item = gridToItems(w.grid).find(
      (value) => value.employeeId === employeeId && value.businessDate === businessDate,
    );
    setEditor({
      employeeId,
      businessDate,
      zoneId: item?.zoneId ?? zoneId,
      ...(templateId ? { templateId } : {}),
    });
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, rowIndex: number, dayIndex: number) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [rowIndex, dayIndex + 1],
      ArrowLeft: [rowIndex, dayIndex - 1],
      ArrowDown: [rowIndex + 1, dayIndex],
      ArrowUp: [rowIndex - 1, dayIndex],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const rowStep = move[0] - rowIndex;
      const dayStep = move[1] - dayIndex;
      let nextRow = move[0];
      let nextDay = move[1];
      while (visible[nextRow] && days[nextDay]) {
        const employee = visible[nextRow];
        const date = days[nextDay];
        if (!employee || !date) break;
        if (!outsideZone(employee.employeeId, date) && (w.writable || !!employee.cells[date])) {
          const next = `${employee.employeeId}:${date}`;
          setFocus(next);
          document.getElementById(`${instance}:${next}`)?.focus();
          break;
        }
        nextRow += rowStep;
        nextDay += dayStep;
      }
      return;
    }
    if (!w.writable) return;
    const row = visible[rowIndex];
    const date = days[dayIndex];
    if (!row || !date || outsideZone(row.employeeId, date)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      w.edit(setCell(w.grid, row.employeeId, date, ''));
      return;
    }
    const key = event.key.toLowerCase();
    const night = ['n', 'н', 'т'].includes(key);
    const day = ['d', 'д', 'в'].includes(key);
    if (!night && !day) return;
    event.preventDefault();
    const template = w.templates.find((value) => value.isActive && value.isNight === night);
    if (!template) return;
    const item = gridToItems(w.grid).find(
      (value) => value.employeeId === row.employeeId && value.businessDate === date,
    );
    if (item) w.edit(setAssignment(w.grid, { ...item, templateId: template.id }));
    else open(row.employeeId, date, event.currentTarget, template.id);
  }
  return (
    <div id={instance} role="region" aria-label={t.people} tabIndex={-1} className="space-y-3">
      <div className="flex items-center gap-2">
        <TableSearch value={search} onChange={setSearch} label={t.workerSearch} />
        <InfoTip text={t.keyboard} />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table
          aria-label={t.people}
          className="min-w-max [&_tr>*:not(:last-child)]:border-r [&_tr>*]:border-border"
        >
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 w-40 bg-background">{t.workers}</TableHead>
              {days.map((date) => (
                <TableHead key={date} className="px-1 text-center">
                  {date.slice(8)}
                </TableHead>
              ))}
              <TableHead className="sticky right-0 z-10 max-w-40 bg-background whitespace-normal text-right text-xs">
                {t.assigned} / {t.personHours}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, rowIndex) => {
              const summary = summarize(
                gridToItems({ rows: [row] }),
                w.templates,
                w.timezone,
                w.recorded,
              );
              return (
                <TableRow key={row.employeeId}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <span className="block w-32 whitespace-normal break-words font-medium">
                        {employeeLabel(w, row.employeeId)}
                      </span>
                      {w.writable && (
                        <RowMenu
                          label={`${zoneId ? t.removeZoneAssignments : t.removeWorker}: ${employeeLabel(w, row.employeeId)}`}
                          actions={[
                            {
                              key: 'remove',
                              label: zoneId ? t.removeZoneAssignments : t.removeWorker,
                              icon: Trash2Icon,
                              destructive: true,
                              disabled: !Object.values(row.cells).some(Boolean),
                              onSelect: () =>
                                w.edit(
                                  zoneId
                                    ? removeZoneAssignments(w.grid, row.employeeId, zoneId)
                                    : removeRow(w.grid, row.employeeId),
                                ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  </TableCell>
                  {days.map((date, dayIndex) => {
                    const template = w.templates.find((value) => value.id === row.cells[date]);
                    const hidden = outsideZone(row.employeeId, date);
                    const cellKey = `${row.employeeId}:${date}`;
                    const label = template
                      ? template.isNight
                        ? dayKinds.NIGHT
                        : dayKinds.DAY
                      : row.cells[date]
                        ? '?'
                        : dayKinds.OFF;
                    return (
                      <TableCell key={date} className="p-0.5 text-center">
                        {hidden ? (
                          <span
                            className="inline-flex min-h-9 min-w-9 items-center justify-center text-muted-foreground"
                            title={t.outsideZone}
                          >
                            <span aria-hidden>—</span>
                            <span className="sr-only">{t.outsideZone}</span>
                          </span>
                        ) : w.writable || !!row.cells[date] ? (
                          <Button
                            id={`${instance}:${cellKey}`}
                            variant="ghost"
                            size="sm"
                            tabIndex={focusKey === cellKey ? 0 : -1}
                            aria-pressed={
                              editor?.employeeId === row.employeeId && editor.businessDate === date
                            }
                            onFocus={() => setFocus(cellKey)}
                            onKeyDown={(event) => keyDown(event, rowIndex, dayIndex)}
                            aria-label={`${employeeLabel(w, row.employeeId)}, ${date}, ${template ? templateLabel(template.code, t) : dayKinds.OFF}`}
                            onClick={(event) => open(row.employeeId, date, event.currentTarget)}
                            className={cn(
                              'min-h-9 min-w-9 p-1',
                              calendarInteraction,
                              template && calendarItemColors[template.isNight ? 'indigo' : 'amber'],
                            )}
                          >
                            {label}
                          </Button>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex min-h-9 min-w-9 items-center justify-center rounded text-sm',
                              template && calendarItemColors[template.isNight ? 'indigo' : 'amber'],
                            )}
                            title={`${date} · ${template ? templateLabel(template.code, t) : dayKinds.OFF}`}
                          >
                            {label}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="sticky right-0 z-10 bg-background text-right tabular-nums">
                    {summary.assignments} /{' '}
                    {summary.minutes === null ? '—' : formatDuration(summary.minutes)}
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={days.length + 2}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t.noAssignments}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Paginator pages={pages} total={rows.length} />
      <CalendarDetailPanel
        open={!!editor}
        title={editor ? employeeLabel(w, editor.employeeId) : t.people}
        description={editor?.businessDate}
        onClose={() => setEditor(null)}
        onRestoreFocus={() => {
          if (trigger?.isConnected) trigger.focus();
          else document.getElementById(instance)?.focus();
        }}
      >
        {editor && w.writable ? (
          <AssignmentEditor
            key={`${editor.employeeId}:${editor.businessDate}:${editor.templateId}`}
            workspace={w}
            context={editor}
            onClose={() => setEditor(null)}
          />
        ) : readOnlyDetails ? (
          <div className="space-y-3 text-sm">
            <p className="[overflow-wrap:anywhere]">{readOnlyDetails.title}</p>
            <p>{readOnlyDetails.time}</p>
            <p>{readOnlyDetails.description}</p>
            <p>{readOnlyDetails.status}</p>
            <p>{acknowledgement}</p>
            <p className="text-muted-foreground">{t.presenceUnknown}</p>
          </div>
        ) : null}
      </CalendarDetailPanel>
    </div>
  );
}
