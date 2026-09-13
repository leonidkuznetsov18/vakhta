import { useState, type ReactNode } from 'react';
import { CircleDashedIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from 'cn';
import { CalendarDetailPanel } from './detail-panel';
import { calendarItemColors, calendarInteraction } from './styles';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Paginator, usePages } from '@/components/app/data-table';
import { useTablePage } from '@/shared/lib/table-model';
import type {
  CalendarCell,
  CalendarItem,
  CalendarNote,
  CalendarResource,
  CalendarSelection,
  CalendarViewModel,
} from './model';

const NOTE_TONE = {
  danger: 'text-red-700 dark:text-red-300',
  ok: 'text-emerald-700 dark:text-emerald-300',
  muted: 'text-muted-foreground',
} as const;

function Note({ note, className }: { readonly note: CalendarNote; readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] leading-4',
        NOTE_TONE[note.tone],
        className,
      )}
    >
      {note.tone === 'danger' && <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />}
      <span className="min-w-0 truncate">{note.text}</span>
    </span>
  );
}

interface ResourceCalendarProps {
  readonly model: CalendarViewModel;
  readonly layout: 'grid' | 'list';
  readonly selectedDate: string;
  readonly selection: CalendarSelection | null;
  readonly detail?: ReactNode;
  readonly onDate: (date: string) => void;
  readonly onSelect: (selection: CalendarSelection) => void;
  /** Closing the details drops the selection, so the pressed card style never outlives the panel. */
  readonly onClearSelection?: () => void;
  readonly onCreate: (selection: CalendarSelection) => void;
  /** Items matching the emphasis get a ring and the rest fade, so a count becomes visible places. */
  readonly emphasis?: CalendarEmphasis | null;
  /** Drag and drop of an item onto another row/date; the keyboard alternative is the caller's. */
  readonly onMove?: (
    item: CalendarSelection & { readonly itemId: string },
    target: { readonly resourceId: string; readonly date: string },
  ) => void;
}
export type CalendarEmphasis = 'unpublished' | 'WARN' | 'BLOCK';
/** Translucent column tints by day event; the header text and icons carry the meaning. */
const HEADER_TINT = {
  holiday: 'bg-rose-500/15 dark:bg-rose-400/20',
  absence: 'bg-red-500/12 dark:bg-red-400/20',
  birthday: 'bg-violet-500/15 dark:bg-violet-400/20',
} as const;
const COLUMN_TINT = {
  holiday: 'bg-rose-500/6 dark:bg-rose-400/10',
  absence: 'bg-red-500/5 dark:bg-red-400/10',
  birthday: 'bg-violet-500/6 dark:bg-violet-400/10',
} as const;
const EVENT_TEXT = {
  holiday: 'text-rose-700 dark:text-rose-300',
  absence: 'text-red-700 dark:text-red-300',
  birthday: 'text-violet-700 dark:text-violet-300',
} as const;
function emphasized(item: CalendarItem, emphasis: CalendarEmphasis): boolean {
  if (emphasis === 'unpublished') return !!item.unpublished && !item.readonly;
  return item.issue === emphasis;
}
const PAGE_SIZE = 20;
const CELL_PREVIEW_LIMIT = 3;

function ItemContent({ item }: { readonly item: CalendarItem }) {
  const description = [item.description, ...(item.parts?.map((part) => part.label) ?? [])]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <span className="block min-w-0 truncate font-medium leading-5">{item.title}</span>
      <span className="block min-w-0 truncate text-[11px] leading-4 tabular-nums">{item.time}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
        <span className="min-w-0 truncate">{description}</span>
        {(item.status || item.issue) && (
          <span className="ml-auto flex shrink-0 items-center gap-1" title={item.status}>
            {item.issue && (
              <TriangleAlertIcon
                aria-hidden
                className={cn(
                  'size-3.5',
                  item.issue === 'BLOCK'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-amber-700 dark:text-amber-300',
                )}
              />
            )}
            {item.status && <CircleDashedIcon aria-hidden className="size-3.5" />}
            <span className="sr-only">{item.status}</span>
          </span>
        )}
      </span>
      {item.flags?.map((flag) => (
        <span
          key={flag.label}
          className={cn(
            'mt-0.5 mr-1 inline-block max-w-full truncate rounded px-1 text-[10px] leading-4 font-medium',
            flag.tone === 'danger' && 'bg-red-600 text-white dark:bg-red-500 dark:text-red-950',
            flag.tone === 'warn' &&
              'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
            flag.tone === 'info' &&
              'bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
          )}
        >
          {flag.label}
        </span>
      ))}
      {item.marker && (
        <span
          className={cn(
            'block min-w-0 truncate text-[10px] leading-4',
            item.marker.tone === 'ok' && 'text-emerald-700 dark:text-emerald-300',
            item.marker.tone === 'danger' && 'text-amber-700 dark:text-amber-300',
            item.marker.tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {item.marker.label}
        </span>
      )}
    </>
  );
}

/** A controlled projection: no API access, date arithmetic, permissions or draft writes. */
export function ResourceCalendar(props: ResourceCalendarProps) {
  const { model, layout, selectedDate, selection, detail, onDate } = props;
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusOrigin, setFocusOrigin] = useState<{
    trigger: HTMLElement;
    calendar: Element | null;
  } | null>(null);
  const [dragging, setDragging] = useState<(CalendarSelection & { itemId: string }) | null>(null);
  const selectedResource = model.resources.find((row) => row.id === selection?.resourceId);
  const selectedCell = selectedResource?.cells.find((cell) => cell.date === selection?.date);
  function openFrom(trigger: HTMLButtonElement) {
    setFocusOrigin({ trigger, calendar: trigger.closest('[data-resource-calendar]') });
    setDetailOpen(true);
  }
  const pages = usePages(model.resources.length, PAGE_SIZE, undefined, -1, model.resourceLabel);
  const rows = useTablePage(model.resources, (row) => row.id, pages.page, pages.size);
  function cellContent(row: CalendarResource, cell: CalendarCell) {
    const cellSelected = selection?.resourceId === row.id && selection.date === cell.date;
    const empty = cell.items.length === 0;
    const readonlyDate = !!model.dates.find((date) => date.id === cell.date)?.readonly;
    const droppable = !!props.onMove && !!dragging && !readonlyDate;
    return (
      <div
        className={cn(
          'group/cell flex min-h-[4.75rem] min-w-0 flex-col gap-1.5 rounded-md',
          droppable && 'outline-dashed outline-1 outline-offset-2 outline-muted-foreground/40',
        )}
        onDragOver={(event) => {
          if (droppable) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!droppable || !dragging) return;
          event.preventDefault();
          props.onMove?.(dragging, { resourceId: row.id, date: cell.date });
          setDragging(null);
        }}
      >
        {cell.note && <Note note={cell.note} className="px-0.5" />}
        {cell.items.slice(0, CELL_PREVIEW_LIMIT).map((item) => {
          const selected = cellSelected && selection?.itemId === item.id;
          const highlight = props.emphasis ? emphasized(item, props.emphasis) : null;
          return (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={selected}
              data-emphasized={highlight === null ? undefined : highlight}
              aria-label={[
                item.title,
                cell.label,
                item.time,
                item.description,
                item.status,
                item.marker?.label ?? '',
                ...(item.flags?.map((flag) => flag.label) ?? []),
                item.issue ? model.issueLabels?.[item.issue] : '',
              ]
                .filter(Boolean)
                .join(', ')}
              className={cn(
                'h-auto w-full min-w-0 justify-start whitespace-normal px-1.5 py-1.5 text-left shadow-none transition-colors',
                calendarItemColors[item.tone],
                calendarInteraction,
                item.unpublished && 'border-dashed border-current/50',
                item.readonly && 'opacity-70',
                item.issue === 'BLOCK' && 'inset-ring-2 inset-ring-red-500/70',
                highlight === true && 'ring-2 ring-offset-2 ring-sky-600 dark:ring-sky-400',
                highlight === false && 'opacity-35',
              )}
              draggable={!!props.onMove && !item.readonly}
              onDragStart={() =>
                setDragging({ resourceId: row.id, date: cell.date, itemId: item.id })
              }
              onDragEnd={() => setDragging(null)}
              onClick={(event) => {
                openFrom(event.currentTarget);
                props.onSelect({ resourceId: row.id, date: cell.date, itemId: item.id });
              }}
            >
              <span className="grid w-full min-w-0 grid-rows-[1.25rem_1rem_1rem] gap-y-0.5">
                <ItemContent item={item} />
              </span>
            </Button>
          );
        })}
        {cell.items.length > CELL_PREVIEW_LIMIT && (
          <Button
            variant="ghost"
            className={cn('h-auto min-h-9 w-full whitespace-normal text-xs', calendarInteraction)}
            onClick={(event) => {
              openFrom(event.currentTarget);
              props.onSelect({ resourceId: row.id, date: cell.date });
            }}
            aria-expanded={cellSelected && !selection?.itemId}
          >
            {model.moreItemsLabel.replace(
              '{count}',
              String(cell.items.length - CELL_PREVIEW_LIMIT),
            )}
          </Button>
        )}
        {cell.create && !cell.create.disabledReason && (
          <Button
            variant={empty ? 'ghost' : 'outline'}
            size={empty ? 'default' : 'sm'}
            aria-label={`${cell.create.label}: ${row.title}, ${cell.date}`}
            className={cn(
              'w-full whitespace-normal text-xs text-muted-foreground',
              empty
                ? 'h-auto min-h-[4.75rem] flex-1 border border-dashed border-transparent opacity-0 transition-opacity hover:border-border hover:text-foreground focus-visible:opacity-100 group-hover/cell:opacity-100 max-md:opacity-100'
                : cn(
                    'h-auto min-h-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/cell:opacity-100 max-md:opacity-100',
                    cellSelected && 'opacity-100',
                  ),
              calendarInteraction,
            )}
            onClick={(event) => {
              if (!cell.create || cell.create.disabledReason) return;
              openFrom(event.currentTarget);
              props.onCreate({ resourceId: row.id, date: cell.date });
            }}
          >
            <PlusIcon aria-hidden className="size-4 shrink-0" />
            {cell.create.label}
          </Button>
        )}
        {cell.create?.disabledReason && empty && !readonlyDate && (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {cell.create.disabledReason}
          </p>
        )}
      </div>
    );
  }
  return (
    <section
      data-resource-calendar
      tabIndex={-1}
      aria-label={model.label}
      className="min-w-0 space-y-3"
    >
      {layout === 'list' ? (
        <>
          <div className="flex gap-1 overflow-x-auto pb-1" aria-label={model.label}>
            {model.dates.map((date) => (
              <Button
                key={date.id}
                variant={selectedDate === date.id ? 'default' : 'outline'}
                aria-label={date.label}
                aria-pressed={selectedDate === date.id}
                className={cn(
                  'min-h-11 min-w-11 flex-1 flex-col gap-0 px-1 text-xs leading-tight',
                  date.today &&
                    selectedDate !== date.id &&
                    'border-2 border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-300',
                  date.tone && selectedDate !== date.id && HEADER_TINT[date.tone],
                )}
                onClick={() => onDate(date.id)}
              >
                <span>{date.shortLabel}</span>
                {date.summary && <span className="text-[10px] opacity-80">{date.summary}</span>}
                {date.holiday && <span className="text-[10px]">🎉</span>}
                {date.events && date.events.length > 0 && (
                  <span className="text-[10px]">
                    {date.events.map((event) => event.slice(0, 2)).join('')}
                  </span>
                )}
              </Button>
            ))}
          </div>
          {(() => {
            const day = model.dates.find((date) => date.id === selectedDate);
            if (!day?.holiday && !day?.events?.length) return null;
            return (
              <p className="text-xs [overflow-wrap:anywhere]">
                {day.holiday && (
                  <span className="mr-2 text-rose-700 dark:text-rose-300">🎉 {day.holiday}</span>
                )}
                {day.events?.map((event) => (
                  <span
                    key={event}
                    className={cn(
                      'mr-2',
                      event.startsWith('🎂') ? EVENT_TEXT.birthday : EVENT_TEXT.absence,
                    )}
                  >
                    {event}
                  </span>
                ))}
              </p>
            );
          })()}
          <div className="space-y-3">
            {rows.map((row) => {
              const cell = row.cells.find((value) => value.date === selectedDate);
              return (
                <section key={row.id} className="min-w-0 space-y-3 rounded-lg border p-3">
                  <div>
                    <h3 className="font-semibold [overflow-wrap:anywhere]">{row.title}</h3>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {[row.description, row.summary].filter(Boolean).join(' · ')}
                    </p>
                    {row.badge && <Note note={row.badge} />}
                  </div>
                  {cell ? cellContent(row, cell) : <p>{model.emptyLabel}</p>}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table
            aria-label={model.label}
            className="table-fixed [&_tr>*:not(:last-child)]:border-r [&_tr>*]:border-border"
            style={{ minWidth: `${160 + model.dates.length * 136}px` }}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 w-40 whitespace-normal bg-background">
                  {model.resourceLabel}
                </TableHead>
                {model.dates.map((date, index) => (
                  <TableHead
                    key={date.id}
                    aria-current={date.today ? 'date' : undefined}
                    title={date.readonly ? date.label : undefined}
                    className={cn(
                      'w-34 whitespace-normal px-2 py-1.5 text-center align-top',
                      date.today &&
                        'bg-emerald-500/15 shadow-[inset_3px_0_0_var(--color-emerald-600),inset_-3px_0_0_var(--color-emerald-600),inset_0_3px_0_var(--color-emerald-600)] dark:bg-emerald-400/20 dark:shadow-[inset_3px_0_0_var(--color-emerald-500),inset_-3px_0_0_var(--color-emerald-500),inset_0_3px_0_var(--color-emerald-500)]',
                      date.readonly && 'bg-muted/40 text-muted-foreground',
                      date.tone && !date.today && HEADER_TINT[date.tone],
                      // The container clips at its rounded corners; give the corner cells the same
                      // radius so a solid header or frame follows the curve instead of being cut.
                      index === model.dates.length - 1 && 'rounded-tr-lg',
                    )}
                  >
                    <span
                      className={cn(
                        'block font-medium',
                        date.today
                          ? 'font-bold text-emerald-700 dark:text-emerald-300'
                          : 'text-foreground',
                      )}
                    >
                      {date.label}
                    </span>
                    {date.summary && (
                      <span
                        className={cn(
                          'block text-[11px] font-normal tabular-nums',
                          'text-muted-foreground',
                        )}
                      >
                        {date.summary}
                      </span>
                    )}
                    {date.holiday && (
                      <span
                        className={cn(
                          'block text-[11px] font-normal',
                          'text-rose-700 dark:text-rose-300',
                        )}
                      >
                        🎉 {date.holiday}
                      </span>
                    )}
                    {date.events?.map((event) => (
                      <span
                        key={event}
                        className={cn(
                          'block text-[11px] font-normal [overflow-wrap:anywhere]',
                          event.startsWith('🎂') ? EVENT_TEXT.birthday : EVENT_TEXT.absence,
                        )}
                      >
                        {event}
                      </span>
                    ))}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={row.id} className="hover:bg-transparent">
                  <TableCell className="sticky left-0 z-10 whitespace-normal bg-background align-top">
                    <p className="font-semibold [overflow-wrap:anywhere]">{row.title}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {row.description}
                    </p>
                    {row.summary && (
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {row.summary}
                      </p>
                    )}
                    {row.badge && <Note note={row.badge} className="mt-1" />}
                  </TableCell>
                  {row.cells.map((cell, index) => (
                    <TableCell
                      key={cell.date}
                      className={cn(
                        'whitespace-normal p-1.5 align-top',
                        model.dates[index]?.tone &&
                          !model.dates[index]?.today &&
                          COLUMN_TINT[model.dates[index].tone],
                        rowIndex === rows.length - 1 &&
                          index === row.cells.length - 1 &&
                          'rounded-br-lg',
                        // Wall-calendar slider: a solid frame drawn with inset shadows, which
                        // neither the collapsed borders nor the rounded container can clip.
                        model.dates[index]?.today &&
                          'bg-emerald-500/8 shadow-[inset_3px_0_0_var(--color-emerald-600),inset_-3px_0_0_var(--color-emerald-600)] dark:bg-emerald-400/10 dark:shadow-[inset_3px_0_0_var(--color-emerald-500),inset_-3px_0_0_var(--color-emerald-500)]',
                        model.dates[index]?.today &&
                          rowIndex === rows.length - 1 &&
                          'shadow-[inset_3px_0_0_var(--color-emerald-600),inset_-3px_0_0_var(--color-emerald-600),inset_0_-3px_0_var(--color-emerald-600)] dark:shadow-[inset_3px_0_0_var(--color-emerald-500),inset_-3px_0_0_var(--color-emerald-500),inset_0_-3px_0_var(--color-emerald-500)]',
                        model.dates[index]?.readonly && 'bg-muted/30',
                      )}
                    >
                      {cellContent(row, cell)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{model.emptyLabel}</p>}
      <Paginator pages={pages} total={model.resources.length} />
      <CalendarDetailPanel
        open={detailOpen && !!selectedCell && !!detail}
        title={selectedResource?.title ?? model.label}
        description={selectedCell?.label}
        onClose={() => {
          setDetailOpen(false);
          props.onClearSelection?.();
        }}
        onRestoreFocus={() => {
          if (focusOrigin?.trigger.isConnected) focusOrigin.trigger.focus();
          else if (focusOrigin?.calendar instanceof HTMLElement) focusOrigin.calendar.focus();
        }}
      >
        {detail}
      </CalendarDetailPanel>
    </section>
  );
}
