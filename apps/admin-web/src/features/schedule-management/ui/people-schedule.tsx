import { Trash2Icon } from 'lucide-react';
import { Fragment, useId, useState, type KeyboardEvent } from 'react';
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
import { RowDetail } from '@/components/app/row-detail';
import { InfoTip } from '@/components/app/info-tip';
import { formatDuration } from '@/lib/format';
import { cn } from 'cn';
import type { Workspace } from '../model/use-workspace';
import { gridToItems, setAssignment, setCell, removeRow } from '../model/grid';
import { summarize } from '../model/planning';
import { employeeLabel } from './assignment-changes';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
const t = messages(currentLocale()).scheduleWorkspace;
const dayKinds = messages(currentLocale()).schedule.dayKinds;
export function PeopleSchedule({ workspace: w }: { workspace: Workspace }) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const [focus, setFocus] = useState('');
  const instance = useId();
  const days = monthDates(w.month);
  const rows = w.grid.rows.filter((row) =>
    employeeLabel(w, row.employeeId)
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const pages = usePages(rows.length, 20, 'schedule.people', -1, `${w.month}:${search}`);
  const visible = rows.slice((pages.page - 1) * pages.size, pages.page * pages.size);
  const first = `${visible[0]?.employeeId}:${days[0]}`;
  const focusKey = visible.some((row) => days.some((date) => `${row.employeeId}:${date}` === focus))
    ? focus
    : first;
  function open(employeeId: string, businessDate: string, templateId?: string) {
    const item = gridToItems(w.grid).find(
      (value) => value.employeeId === employeeId && value.businessDate === businessDate,
    );
    setEditor({
      employeeId,
      businessDate,
      zoneId: item?.zoneId ?? '',
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
      const employee = visible[move[0]];
      const date = days[move[1]];
      if (employee && date) {
        const next = `${employee.employeeId}:${date}`;
        setFocus(next);
        document.getElementById(`${instance}:${next}`)?.focus();
      }
      return;
    }
    if (!w.writable) return;
    const row = visible[rowIndex];
    const date = days[dayIndex];
    if (!row || !date) return;
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
    else open(row.employeeId, date, template.id);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TableSearch value={search} onChange={setSearch} label={t.workerSearch} />
        <InfoTip text={t.keyboard} />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table aria-label={t.people} className="min-w-max">
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
                <Fragment key={row.employeeId}>
                  <TableRow>
                    <TableCell className="sticky left-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <span className="block w-32 whitespace-normal break-words font-medium">
                          {employeeLabel(w, row.employeeId)}
                        </span>
                        {w.writable && (
                          <RowMenu
                            label={`${t.removeWorker}: ${employeeLabel(w, row.employeeId)}`}
                            actions={[
                              {
                                key: 'remove',
                                label: t.removeWorker,
                                icon: Trash2Icon,
                                destructive: true,
                                disabled: !Object.values(row.cells).some(Boolean),
                                onSelect: () => w.edit(removeRow(w.grid, row.employeeId)),
                              },
                            ]}
                          />
                        )}
                      </div>
                    </TableCell>
                    {days.map((date, dayIndex) => {
                      const template = w.templates.find((value) => value.id === row.cells[date]);
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
                          {w.writable ? (
                            <Button
                              id={`${instance}:${cellKey}`}
                              variant="ghost"
                              size="sm"
                              tabIndex={focusKey === cellKey ? 0 : -1}
                              onFocus={() => setFocus(cellKey)}
                              onKeyDown={(event) => keyDown(event, rowIndex, dayIndex)}
                              aria-label={`${employeeLabel(w, row.employeeId)}, ${date}, ${template?.code ?? dayKinds.OFF}`}
                              onClick={() => open(row.employeeId, date)}
                              className={cn(
                                'min-h-9 min-w-9 p-1',
                                template &&
                                  (template.isNight
                                    ? 'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100'
                                    : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100'),
                              )}
                            >
                              {label}
                            </Button>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex min-h-9 min-w-9 items-center justify-center rounded text-sm',
                                template &&
                                  (template.isNight
                                    ? 'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100'
                                    : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100'),
                              )}
                              title={`${date} · ${template?.code ?? dayKinds.OFF}`}
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
                  {editor?.employeeId === row.employeeId && w.writable && (
                    <TableRow>
                      <TableCell colSpan={days.length + 2}>
                        <div className="sticky left-0 max-w-[calc(100vw-4rem)] md:max-w-2xl">
                          <RowDetail>
                            <AssignmentEditor
                              key={`${editor.employeeId}:${editor.businessDate}:${editor.templateId}`}
                              workspace={w}
                              context={editor}
                              onClose={() => setEditor(null)}
                            />
                          </RowDetail>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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
    </div>
  );
}
