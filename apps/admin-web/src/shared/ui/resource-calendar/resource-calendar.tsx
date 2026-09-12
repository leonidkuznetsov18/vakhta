import { useState, type ReactNode } from 'react';
import { PlusIcon } from 'lucide-react';
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
  CalendarResource,
  CalendarSelection,
  CalendarViewModel,
} from './model';

interface ResourceCalendarProps {
  readonly model: CalendarViewModel;
  readonly layout: 'grid' | 'list';
  readonly selectedDate: string;
  readonly selection: CalendarSelection | null;
  readonly detail?: ReactNode;
  readonly onDate: (date: string) => void;
  readonly onSelect: (selection: CalendarSelection) => void;
  readonly onCreate: (selection: CalendarSelection) => void;
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
      <span className="line-clamp-2 min-w-0 text-xs font-medium leading-4 tabular-nums">
        {item.time}
      </span>
      <span className="block min-w-0 truncate text-xs leading-4">{description}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-4">
        {item.status && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
        <span className="truncate">{item.status}</span>
      </span>
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
  const selectedResource = model.resources.find((row) => row.id === selection?.resourceId);
  const selectedCell = selectedResource?.cells.find((cell) => cell.date === selection?.date);
  function openFrom(trigger: HTMLButtonElement) {
    setFocusOrigin({ trigger, calendar: trigger.closest('[data-resource-calendar]') });
    setDetailOpen(true);
  }
  const pages = usePages(model.resources.length, PAGE_SIZE, undefined, -1, model.resourceLabel);
  const rows = useTablePage(model.resources, (row) => row.id, pages.page, pages.size);
  function cellContent(row: CalendarResource, cell: CalendarCell) {
    return (
      <div className="space-y-2 min-w-0">
        {cell.items.slice(0, CELL_PREVIEW_LIMIT).map((item) => {
          const selected =
            selection?.resourceId === row.id &&
            selection.date === cell.date &&
            selection.itemId === item.id;
          return (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={selected}
              aria-label={`${item.title}, ${cell.label}, ${item.time}, ${item.description}, ${item.status}`}
              className={cn(
                'h-28 w-full min-w-0 justify-start whitespace-normal text-left p-2.5 shadow-none transition-colors',
                calendarItemColors[item.tone],
                calendarInteraction,
              )}
              onClick={(event) => {
                openFrom(event.currentTarget);
                props.onSelect({ resourceId: row.id, date: cell.date, itemId: item.id });
              }}
            >
              <span className="grid h-full min-w-0 w-full grid-rows-[1.25rem_2rem_1rem_1rem] gap-y-0.5">
                <ItemContent item={item} />
              </span>
            </Button>
          );
        })}
        {cell.items.length === 0 && <p className="text-xs text-muted-foreground">{cell.summary}</p>}
        {cell.items.length > CELL_PREVIEW_LIMIT && (
          <Button
            variant="ghost"
            className={cn('h-auto min-h-11 w-full whitespace-normal text-xs', calendarInteraction)}
            onClick={(event) => {
              openFrom(event.currentTarget);
              props.onSelect({ resourceId: row.id, date: cell.date });
            }}
            aria-expanded={
              selection?.resourceId === row.id && selection.date === cell.date && !selection.itemId
            }
          >
            {model.moreItemsLabel.replace(
              '{count}',
              String(cell.items.length - CELL_PREVIEW_LIMIT),
            )}
          </Button>
        )}
        {cell.create &&
          (cell.items.length === 0 ||
            (selection?.resourceId === row.id && selection.date === cell.date)) && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={!!cell.create.disabledReason}
                aria-label={`${cell.create.label}: ${row.title}, ${cell.date}`}
                className={cn('min-h-11 w-full whitespace-normal h-auto', calendarInteraction)}
                onClick={(event) => {
                  if (!cell.create || cell.create.disabledReason) return;
                  openFrom(event.currentTarget);
                  props.onCreate({ resourceId: row.id, date: cell.date });
                }}
              >
                <PlusIcon aria-hidden className="size-4 shrink-0" />
                {cell.create.label}
              </Button>
              {cell.create.disabledReason && (
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {cell.create.disabledReason}
                </p>
              )}
            </div>
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
                className="min-h-11 min-w-11 flex-1 px-1 text-xs"
                onClick={() => onDate(date.id)}
              >
                {date.shortLabel}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {rows.map((row) => {
              const cell = row.cells.find((value) => value.date === selectedDate);
              return (
                <section key={row.id} className="min-w-0 rounded-lg border p-3 space-y-3">
                  <div>
                    <h3 className="font-semibold [overflow-wrap:anywhere]">{row.title}</h3>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {row.description}
                    </p>
                  </div>
                  {cell ? cellContent(row, cell) : <p>{model.emptyLabel}</p>}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table
            aria-label={model.label}
            className="table-fixed [&_tr>*:not(:last-child)]:border-r [&_tr>*]:border-border"
            style={{ minWidth: `${176 + model.dates.length * 128}px` }}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-44 sticky left-0 z-10 bg-background whitespace-normal">
                  {model.resourceLabel}
                </TableHead>
                {model.dates.map((date) => (
                  <TableHead key={date.id} className="w-32 whitespace-normal text-center">
                    {date.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="sticky left-0 z-10 bg-background align-top whitespace-normal">
                    <p className="font-semibold [overflow-wrap:anywhere]">{row.title}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {row.description}
                    </p>
                  </TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.date} className="align-top whitespace-normal">
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
        onClose={() => setDetailOpen(false)}
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
