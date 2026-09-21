import { EmployeeProfileLink } from '@/entities/employee';
import { isTerminated } from '../model/employee-status';
import { templateLabel } from '../lib/template-label';
import { Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { monthDates } from '@vakhta/domain';
import type { AssignmentInput, EmployeeView, ShiftTemplateView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
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
  type CalendarDate,
  type CalendarEmphasis,
  type CalendarItem,
} from '@/shared/ui/resource-calendar';
import { InfoTip } from '@/components/app/info-tip';
import { Feedback } from '@/components/app/feedback';
import { formatDuration } from '@/lib/format';
import { cn } from 'cn';
import type { Workspace } from '../model/use-workspace';
import {
  assignmentKey,
  gridToItems,
  gridForZone,
  removeZoneAssignments,
  setAssignment,
  removeRow,
  type GridRow,
} from '../model/grid';
import { summarize } from '../model/planning';
import { calendarModel, eventFlags, type EventFlag } from '../model/calendar';
import {
  assignmentAbilities,
  checkedMove,
  removeAssignment,
  revertAssignment,
} from '../model/assignment-actions';
import { useOperations } from '../model/use-operations';
import { useCalendarEvents } from '../model/use-events';
import { useNotes } from '../model/use-notes';
import { employeeLabel } from './assignment-changes';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
import { AssignmentDetails } from './assignment-details';
import { useRemoveAssignment } from './use-remove-assignment';
const t = messages(currentLocale()).scheduleWorkspace;
const dayKinds = messages(currentLocale()).schedule.dayKinds;
interface PersonDay {
  readonly employeeId: string;
  readonly businessDate: string;
}
interface VisibleRow extends GridRow {
  readonly terminated: boolean;
  readonly status: string;
  readonly name: string;
  readonly avatarVersion: string | null | undefined;
  readonly rowClassName: string;
  readonly stickyClassName: string;
}
/** Everything one matrix cell renders, prepared by the parent from the shared calendar model. */
interface CellView {
  readonly key: string;
  readonly date: string;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly item: AssignmentInput | undefined;
  readonly view: CalendarItem | undefined;
  readonly flags: readonly EventFlag[];
  readonly hidden: boolean;
  readonly interactive: boolean;
  readonly removable: boolean;
  readonly draggable: boolean;
  readonly focusable: boolean;
  readonly pressed: boolean;
  readonly highlight: boolean | null;
}
type Issue = NonNullable<CalendarItem['issue']>;
const ISSUE_RING: Record<Issue, string> = {
  BLOCK: 'inset-ring-2 inset-ring-red-500/70',
  WARN: '',
};
const ISSUE_ICON: Record<Issue, string> = {
  BLOCK: 'text-red-700 dark:text-red-300',
  WARN: 'text-amber-700 dark:text-amber-300',
};
const ARROW_STEPS: Record<string, readonly [number, number]> = {
  ArrowRight: [0, 1],
  ArrowLeft: [0, -1],
  ArrowDown: [1, 0],
  ArrowUp: [-1, 0],
};
const NIGHT_KEYS = new Set(['n', 'н', 'т']);
const DAY_KEYS = new Set(['d', 'д', 'в']);
/** Whether a card matches the highlight toggle of the status line (same rule as the week). */
function emphasized(item: CalendarItem, emphasis: CalendarEmphasis): boolean {
  if (emphasis === 'unpublished') return !!item.unpublished && !item.readonly;
  return item.issue === emphasis;
}
function cellLabel(template: ShiftTemplateView | undefined, code: string | undefined): string {
  if (template) return template.isNight ? dayKinds.NIGHT : dayKinds.DAY;
  return code ? '?' : dayKinds.OFF;
}
function shortcutNight(key: string): boolean | null {
  if (NIGHT_KEYS.has(key)) return true;
  if (DAY_KEYS.has(key)) return false;
  return null;
}
/** The next cell in one direction that can open, or null at the edge of the visible page. */
function nextFocusable(input: {
  readonly rows: readonly VisibleRow[];
  readonly days: readonly string[];
  readonly from: readonly [number, number];
  readonly step: readonly [number, number];
  readonly canOpen: (employeeId: string, date: string) => boolean;
}): string | null {
  let row = input.from[0] + input.step[0];
  let day = input.from[1] + input.step[1];
  while (input.rows[row] && input.days[day]) {
    const employee = input.rows[row];
    const date = input.days[day];
    if (employee && date && input.canOpen(employee.employeeId, date))
      return `${employee.employeeId}:${date}`;
    row += input.step[0];
    day += input.step[1];
  }
  return null;
}
function visibleRow(w: Workspace, row: GridRow, employee: EmployeeView | undefined): VisibleRow {
  const terminated = isTerminated(employee);
  return {
    ...row,
    terminated,
    status: terminated
      ? messages(currentLocale()).admin.administration.employees.statuses.TERMINATED
      : '',
    name: employee?.fullName ?? employeeLabel(w, row.employeeId),
    avatarVersion: employee?.avatarVersion,
    rowClassName: terminated ? 'bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200' : '',
    stickyClassName: terminated ? 'bg-gray-100 dark:bg-gray-800' : '',
  };
}
function cellLook(view: CalendarItem | undefined, highlight: boolean | null): string {
  return cn(
    view && calendarItemColors[view.tone],
    view?.unpublished && 'outline-dashed outline-1 outline-offset-[-2px] outline-current/60',
    view?.issue && ISSUE_RING[view.issue],
    highlight === true && 'ring-2 ring-offset-1 ring-sky-600 dark:ring-sky-400',
    highlight === false && 'opacity-35',
  );
}
/**
 * The month as a compact worker/day matrix. Every cell is prepared by the same calendar model as
 * the week cards, so colours, publication state, conflicts, events and presence agree across views.
 */
export function PeopleSchedule({
  workspace: w,
  zoneId = '',
  today,
  reveal = null,
  emphasis = null,
}: {
  workspace: Workspace;
  zoneId?: string;
  today?: string;
  /** A person day the caller wants opened (from the issue list); a new object per request. */
  reveal?: PersonDay | null;
  emphasis?: CalendarEmphasis | null;
}) {
  const days = monthDates(w.month);
  const scope = { accessKey: w.accessKey, siteId: w.siteId, orgUnitId: w.orgUnitId };
  const operations = useOperations({ ...scope, dates: days, enabled: !!w.version });
  const events = useCalendarEvents({ ...scope, dates: days, enabled: !!w.version });
  const notes = useNotes({ ...scope, month: w.month, enabled: !!w.version });
  const quickRemove = useRemoveAssignment(w);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PersonDay | null>(null);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const [focus, setFocus] = useState('');
  const [dragging, setDragging] = useState<PersonDay | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(reveal);
  if (reveal !== revealed) {
    setRevealed(reveal);
    if (reveal) {
      setSearch('');
      setFocus(assignmentKey(reveal));
      setEditor(null);
      setSelected(reveal);
    }
  }
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const instance = useId();
  const itemByKey = new Map(gridToItems(w.grid).map((item) => [assignmentKey(item), item]));
  const employees = new Map(w.employees.map((employee) => [employee.id, employee]));
  const templates = new Map(w.templates.map((template) => [template.id, template]));
  const model = calendarModel({
    ...w,
    issues: w.issues.reasons,
    dates: days,
    grouping: 'people',
    zoneId,
    locale: currentLocale(),
    today,
    editableMonth: w.month,
    allowedZones: w.rights.zones,
    published: w.publicationBaseline,
    ...(operations.data ? { operations: operations.data } : {}),
    ...(w.context ? { absences: w.context.absences } : {}),
    ...(events.data ? { events: events.data } : {}),
  });
  const viewByKey = new Map<string, CalendarItem>(
    model.resources.flatMap((resource) =>
      resource.cells.flatMap((cell) => {
        const view = cell.items[0];
        return view ? [[`${resource.id}:${cell.date}`, view] as const] : [];
      }),
    ),
  );
  const dateByKey = new Map<string, CalendarDate>(model.dates.map((date) => [date.id, date]));
  /** With a zone filter, the person's shift of another zone is shown as a dash, never edited. */
  function outsideZone(employeeId: string, date: string) {
    const item = itemByKey.get(assignmentKey({ employeeId, businessDate: date }));
    return !!zoneId && !!item && item.zoneId !== zoneId;
  }
  function canOpen(employeeId: string, date: string) {
    if (outsideZone(employeeId, date)) return false;
    if (w.writable && !isTerminated(employees.get(employeeId))) return true;
    return itemByKey.has(assignmentKey({ employeeId, businessDate: date }));
  }
  const needle = search.trim().toLocaleLowerCase();
  const rows = gridForZone(w.grid, zoneId).rows.filter((row) =>
    employeeLabel(w, row.employeeId).toLocaleLowerCase().includes(needle),
  );
  const anchor = reveal ? rows.findIndex((row) => row.employeeId === reveal.employeeId) : -1;
  const pages = usePages(
    rows.length,
    20,
    'schedule.people',
    anchor,
    `${w.month}:${needle}:${zoneId}`,
  );
  const visible = rows
    .slice((pages.page - 1) * pages.size, pages.page * pages.size)
    .map((row) => visibleRow(w, row, employees.get(row.employeeId)));
  // Fading the rest only makes sense when at least one visible cell matches the highlight.
  const anyEmphasized =
    !!emphasis &&
    visible.some((row) =>
      days.some((date) => {
        const view = viewByKey.get(`${row.employeeId}:${date}`);
        return !!view && emphasized(view, emphasis);
      }),
    );
  const openable = visible.flatMap((row) =>
    days.filter((date) => canOpen(row.employeeId, date)).map((date) => `${row.employeeId}:${date}`),
  );
  const focusKey = openable.includes(focus) ? focus : (openable[0] ?? '');
  const selectedItem = selected ? itemByKey.get(assignmentKey(selected)) : undefined;
  const selectedView = selected ? viewByKey.get(assignmentKey(selected)) : undefined;
  const abilities = selectedItem ? assignmentAbilities(w, selectedItem) : null;
  function closePanel() {
    setEditor(null);
    setSelected(null);
  }
  function open(
    employeeId: string,
    businessDate: string,
    origin: HTMLElement,
    templateId?: string,
  ) {
    if (!canOpen(employeeId, businessDate)) return;
    setTrigger(origin);
    const item = itemByKey.get(assignmentKey({ employeeId, businessDate }));
    if (item && !templateId) {
      setEditor(null);
      setSelected({ employeeId, businessDate });
      return;
    }
    setSelected(null);
    setEditor({
      employeeId,
      businessDate,
      zoneId: item?.zoneId ?? zoneId,
      ...(templateId ? { templateId } : {}),
    });
  }
  function edit(move: boolean) {
    if (!selectedItem || !abilities?.editable) return;
    setEditor({ ...selectedItem, zoneId: selectedItem.zoneId ?? '', move });
  }
  function removeSelected() {
    if (!selectedItem || !abilities?.removable) return;
    w.edit(removeAssignment(w.grid, selectedItem));
    closePanel();
  }
  function revertSelected() {
    if (!selectedItem || !abilities?.editable || !abilities.locallyChanged) return;
    w.edit(revertAssignment(w.grid, selectedItem, abilities.saved));
    closePanel();
  }
  function drop(employeeId: string, businessDate: string) {
    if (!dragging) return;
    const item = itemByKey.get(assignmentKey(dragging));
    setDragging(null);
    if (!item) return;
    const result = checkedMove({ workspace: w, item, target: { employeeId, businessDate }, t });
    if ('error' in result) {
      if (result.error) setMoveError(result.error);
      return;
    }
    setMoveError(null);
    setSelected(null);
    w.edit(result.grid);
  }
  /** D/N set the shift kind in place; on an empty cell the editor opens with that shift chosen. */
  function applyShortcut(
    event: KeyboardEvent<HTMLButtonElement>,
    cell: PersonDay,
    item: AssignmentInput | undefined,
  ) {
    if (isTerminated(employees.get(cell.employeeId))) return;
    if (item && !assignmentAbilities(w, item).editable) return;
    const night = shortcutNight(event.key.toLowerCase());
    if (night === null) return;
    event.preventDefault();
    const template = w.templates.find((value) => value.isActive && value.isNight === night);
    if (!template) return;
    if (item) w.edit(setAssignment(w.grid, { ...item, templateId: template.id }));
    else open(cell.employeeId, cell.businessDate, event.currentTarget, template.id);
  }
  /** Arrow keys walk to the next cell that can open; true when the key was an arrow. */
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, from: readonly [number, number]) {
    const step = ARROW_STEPS[event.key];
    if (!step) return false;
    event.preventDefault();
    const next = nextFocusable({ rows: visible, days, from, step, canOpen });
    if (next) {
      setFocus(next);
      document.getElementById(`${instance}:${next}`)?.focus();
    }
    return true;
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, rowIndex: number, dayIndex: number) {
    if (moveFocus(event, [rowIndex, dayIndex])) return;
    const row = visible[rowIndex];
    const date = days[dayIndex];
    if (!w.writable || !row || !date || outsideZone(row.employeeId, date)) return;
    const cell = { employeeId: row.employeeId, businessDate: date };
    const item = itemByKey.get(assignmentKey(cell));
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (item) void quickRemove.remove(item);
      return;
    }
    applyShortcut(event, cell, item);
  }
  const highlightOf = (view: CalendarItem | undefined): boolean | null =>
    anyEmphasized && emphasis && view ? emphasized(view, emphasis) : null;
  const isSelected = (employeeId: string, date: string) =>
    selected?.employeeId === employeeId && selected.businessDate === date;
  function cellView(row: VisibleRow, date: string): CellView {
    const key = `${row.employeeId}:${date}`;
    const item = itemByKey.get(key);
    const view = viewByKey.get(key);
    const code = row.cells[date];
    const template = templates.get(code ?? '');
    const flags = eventFlags(events.data, row.employeeId, date, t);
    const removable = !!item && !!view?.removable;
    return {
      key,
      date,
      name: employeeLabel(w, row.employeeId),
      label: cellLabel(template, code),
      description: cellDescription({ template, status: row.status, view, flags, model }),
      item,
      view,
      flags,
      hidden: outsideZone(row.employeeId, date),
      interactive: (w.writable && !row.terminated) || !!item,
      removable,
      draggable: removable && !row.terminated,
      focusable: focusKey === key,
      pressed: isSelected(row.employeeId, date),
      highlight: highlightOf(view),
    };
  }
  const panelPerson = editor?.employeeId ?? selected?.employeeId;
  return (
    <div id={instance} role="region" aria-label={t.people} tabIndex={-1} className="space-y-3">
      <Feedback error={moveError} />
      <div className="flex items-center gap-2">
        <TableSearch value={search} onChange={setSearch} label={t.workerSearch} />
        <InfoTip text={w.writable ? `${t.keyboard} ${t.dragHint}` : t.keyboard} />
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
                <MonthHead key={date} date={date} info={dateByKey.get(date)} today={today} />
              ))}
              <TableHead className="sticky right-0 z-10 max-w-40 bg-background whitespace-normal text-right text-xs">
                {t.assigned} / {t.personHours}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, rowIndex) => (
              <TableRow key={row.employeeId} className={row.rowClassName}>
                <WorkerCell
                  workspace={w}
                  row={row}
                  zoneId={zoneId}
                  onRemoveAll={() =>
                    w.edit(
                      zoneId
                        ? removeZoneAssignments(w.grid, row.employeeId, zoneId)
                        : removeRow(w.grid, row.employeeId),
                    )
                  }
                />
                {days.map((date, dayIndex) => (
                  <MonthCell
                    key={date}
                    id={`${instance}:${row.employeeId}:${date}`}
                    cell={cellView(row, date)}
                    holiday={!!dateByKey.get(date)?.holiday && date !== today}
                    droppable={!!dragging && w.writable}
                    onOpen={(origin) => open(row.employeeId, date, origin)}
                    onKeyDown={(event) => keyDown(event, rowIndex, dayIndex)}
                    onFocus={() => setFocus(`${row.employeeId}:${date}`)}
                    onDragStart={() =>
                      setDragging({ employeeId: row.employeeId, businessDate: date })
                    }
                    onDragEnd={() => setDragging(null)}
                    onDrop={() => drop(row.employeeId, date)}
                    onRemove={(item) => void quickRemove.remove(item)}
                  />
                ))}
                <TableCell
                  className={cn(
                    'sticky right-0 z-10 bg-background text-right tabular-nums',
                    row.stickyClassName,
                  )}
                >
                  <RowSummary workspace={w} row={row} />
                </TableCell>
              </TableRow>
            ))}
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
          {visible.length > 0 && <MonthTotals days={days} dateByKey={dateByKey} />}
        </Table>
      </div>
      <Paginator pages={pages} total={rows.length} />
      <CalendarDetailPanel
        open={!!editor || !!selectedItem}
        title={panelPerson ? employeeLabel(w, panelPerson) : t.people}
        description={editor?.businessDate ?? selected?.businessDate}
        onClose={closePanel}
        onRestoreFocus={() => {
          if (trigger?.isConnected) trigger.focus();
          else document.getElementById(instance)?.focus();
        }}
      >
        {editor && w.writable && (
          <AssignmentEditor
            key={`${editor.employeeId}:${editor.businessDate}:${editor.templateId}`}
            workspace={w}
            context={editor}
            onClose={() => setEditor(null)}
            onApplied={closePanel}
          />
        )}
        {!editor && selectedItem && abilities && (
          <div className="space-y-3">
            <AssignmentDetails
              workspace={w}
              item={selectedItem}
              view={selectedView}
              abilities={abilities}
              grouping="people"
              events={events}
              operations={operations}
              notes={notes}
              onEdit={edit}
              onRevert={revertSelected}
              onRemove={removeSelected}
            />
          </div>
        )}
      </CalendarDetailPanel>
      {quickRemove.dialog}
    </div>
  );
}
/** The accessible name of a cell: shift, worker state, publication, events and rule issue. */
function cellDescription(input: {
  readonly template: ShiftTemplateView | undefined;
  readonly status: string;
  readonly view: CalendarItem | undefined;
  readonly flags: readonly EventFlag[];
  readonly model: { readonly issueLabels?: Readonly<Record<Issue, string>> };
}): string {
  const issue = input.view?.issue;
  return [
    input.template ? templateLabel(input.template.code, t) : dayKinds.OFF,
    input.status,
    input.view?.status ?? '',
    ...input.flags.map((flag) => flag.label),
    issue ? (input.model.issueLabels?.[issue] ?? '') : '',
  ]
    .filter(Boolean)
    .join(', ');
}
function MonthHead({
  date,
  info,
  today,
}: {
  readonly date: string;
  readonly info: CalendarDate | undefined;
  readonly today: string | undefined;
}) {
  const isToday = date === today;
  return (
    <TableHead
      aria-current={isToday ? 'date' : undefined}
      title={info?.holiday}
      className={cn(
        'px-1 text-center align-top',
        isToday && 'bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
        info?.holiday &&
          !isToday &&
          'bg-sky-500/15 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200',
      )}
    >
      <span className="block">{date.slice(8)}</span>
      {info?.holiday && (
        <span className="block text-[10px] leading-3">
          <span aria-hidden>🎉</span>
          <span className="sr-only">{info.holiday}</span>
        </span>
      )}
    </TableHead>
  );
}
/** Day/night counts per date, the same totals the week shows in its column headers. */
function MonthTotals({
  days,
  dateByKey,
}: {
  readonly days: readonly string[];
  readonly dateByKey: ReadonlyMap<string, CalendarDate>;
}) {
  return (
    <TableFooter>
      <TableRow>
        <TableCell className="sticky left-0 z-10 bg-background text-xs font-normal text-muted-foreground">
          {dayKinds.DAY} / {dayKinds.NIGHT}
        </TableCell>
        {days.map((date) => {
          const counts = dateByKey.get(date)?.counts ?? { day: 0, night: 0 };
          return (
            <TableCell
              key={date}
              className="px-0.5 text-center text-[11px] font-normal text-muted-foreground tabular-nums"
            >
              {counts.day}/{counts.night}
            </TableCell>
          );
        })}
        <TableCell className="sticky right-0 z-10 bg-background" />
      </TableRow>
    </TableFooter>
  );
}
function WorkerCell({
  workspace: w,
  row,
  zoneId,
  onRemoveAll,
}: {
  readonly workspace: Workspace;
  readonly row: VisibleRow;
  readonly zoneId: string;
  readonly onRemoveAll: () => void;
}) {
  const removeLabel = zoneId ? t.removeZoneAssignments : t.removeWorker;
  return (
    <TableCell className={cn('sticky left-0 z-10 bg-background', row.stickyClassName)}>
      <div className="flex items-center gap-1">
        <span className="block w-32 whitespace-normal break-words font-medium">
          <EmployeeProfileLink
            id={row.employeeId}
            name={row.name}
            avatarVersion={row.avatarVersion}
          />
          {row.terminated && (
            <span className="mt-1 flex items-center gap-1 text-xs font-normal text-gray-600 dark:text-gray-300">
              {row.status}
              <InfoTip text={t.terminatedReadOnly} />
            </span>
          )}
        </span>
        {w.writable && (
          <RowMenu
            label={`${removeLabel}: ${employeeLabel(w, row.employeeId)}`}
            actions={[
              {
                key: 'remove',
                label: removeLabel,
                icon: Trash2Icon,
                destructive: true,
                disabled: !Object.values(row.cells).some(Boolean),
                onSelect: onRemoveAll,
              },
            ]}
          />
        )}
      </div>
    </TableCell>
  );
}
function RowSummary({
  workspace: w,
  row,
}: {
  readonly workspace: Workspace;
  readonly row: GridRow;
}) {
  const summary = summarize(gridToItems({ rows: [row] }), w.templates, w.timezone, w.recorded);
  return (
    <>
      {summary.assignments} / {summary.minutes === null ? '—' : formatDuration(summary.minutes)}
    </>
  );
}
function CellFace({ cell }: { readonly cell: CellView }) {
  const issue = cell.view?.issue;
  return (
    <span className="flex flex-col items-center leading-none">
      <span>{cell.label}</span>
      {(cell.flags.length > 0 || issue) && (
        <span className="mt-0.5 flex items-center gap-px text-[9px] leading-none">
          {issue && <TriangleAlertIcon aria-hidden className={cn('size-2.5', ISSUE_ICON[issue])} />}
          {cell.flags.map((flag) => (
            <span key={flag.label} aria-hidden>
              {flag.icon}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
function MonthCell({
  id,
  cell,
  holiday,
  droppable,
  onOpen,
  onKeyDown,
  onFocus,
  onDragStart,
  onDragEnd,
  onDrop,
  onRemove,
}: {
  readonly id: string;
  readonly cell: CellView;
  readonly holiday: boolean;
  readonly droppable: boolean;
  readonly onOpen: (origin: HTMLElement) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: () => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onDrop: () => void;
  readonly onRemove: (item: AssignmentInput) => void;
}) {
  const look = cellLook(cell.view, cell.highlight);
  const canDrop = droppable && !cell.hidden;
  return (
    <TableCell
      className={cn(
        'p-0.5 text-center',
        holiday && 'bg-sky-500/6 dark:bg-sky-400/10',
        canDrop && 'outline-dashed outline-1 outline-offset-[-2px] outline-muted-foreground/40',
      )}
      onDragOver={(event) => {
        if (canDrop) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        onDrop();
      }}
    >
      <CellContent
        id={id}
        cell={cell}
        look={look}
        onOpen={onOpen}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onRemove={onRemove}
      />
    </TableCell>
  );
}
function CellContent({
  id,
  cell,
  look,
  onOpen,
  onKeyDown,
  onFocus,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  readonly id: string;
  readonly cell: CellView;
  readonly look: string;
  readonly onOpen: (origin: HTMLElement) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: () => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onRemove: (item: AssignmentInput) => void;
}) {
  if (cell.hidden)
    return (
      <span
        className="inline-flex min-h-9 min-w-9 items-center justify-center text-muted-foreground"
        title={t.outsideZone}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">{t.outsideZone}</span>
      </span>
    );
  if (!cell.interactive)
    return (
      <span
        className={cn(
          'inline-flex min-h-9 min-w-9 items-center justify-center rounded text-sm',
          look,
        )}
        title={`${cell.date} · ${cell.description}`}
      >
        <CellFace cell={cell} />
      </span>
    );
  return (
    <span className="group/cell relative inline-block">
      <Button
        id={id}
        variant="ghost"
        size="sm"
        tabIndex={cell.focusable ? 0 : -1}
        aria-pressed={cell.pressed}
        draggable={cell.draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        aria-label={`${cell.name}, ${cell.date}, ${cell.description}`}
        onClick={(event) => onOpen(event.currentTarget)}
        className={cn('min-h-9 min-w-9 p-1', calendarInteraction, look)}
      >
        <CellFace cell={cell} />
      </Button>
      {cell.removable && cell.item && (
        <QuickRemove cell={cell} item={cell.item} onRemove={onRemove} />
      )}
    </span>
  );
}
/** Appears on hover above the cell's corner; the confirmation dialog guards the removal. */
function QuickRemove({
  cell,
  item,
  onRemove,
}: {
  readonly cell: CellView;
  readonly item: AssignmentInput;
  readonly onRemove: (item: AssignmentInput) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      tabIndex={-1}
      aria-label={`${t.removeAssignment}: ${cell.name} · ${cell.date}`}
      className="absolute -top-1 -right-1 size-4 rounded-full border bg-background opacity-0 shadow-sm transition-opacity hover:bg-muted group-hover/cell:opacity-100 [&_svg]:size-2.5"
      onClick={() => onRemove(item)}
    >
      <XIcon aria-hidden />
    </Button>
  );
}
