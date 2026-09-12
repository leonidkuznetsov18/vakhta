import { useState, type ReactNode } from 'react';
import { PlusIcon } from 'lucide-react';
import { cn } from 'cn';
import { CalendarDetailPanel } from './detail-panel';
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
const MULTI_DAY_PREVIEW_LIMIT = 1;

const itemColors = {
  info: 'border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900',
  warning:
    'border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900',
  danger:
    'border-red-200 bg-red-50 text-red-950 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900',
  neutral: 'border-border bg-muted/40 text-foreground hover:bg-muted',
} satisfies Record<CalendarItem['tone'], string>;

function ItemContent({ item }: { readonly item: CalendarItem }) {
  return (
    <>
      <span className="block font-medium [overflow-wrap:anywhere]">{item.title}</span>
      <span className="block text-xs font-medium tabular-nums">{item.time}</span>
      {item.description && (
        <span className="block text-xs [overflow-wrap:anywhere]">{item.description}</span>
      )}
      {item.status && (
        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          {item.status}
        </span>
      )}
      {item.parts?.map((part) => (
        <span key={part.id} className="mt-1 block border-t border-current/15 pt-1 text-xs">
          {part.label}
        </span>
      ))}
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
  const previewLimit =
    layout === 'grid' && model.dates.length > 1 ? MULTI_DAY_PREVIEW_LIMIT : CELL_PREVIEW_LIMIT;
  const rows = useTablePage(model.resources, (row) => row.id, pages.page, pages.size);
  function cellContent(row: CalendarResource, cell: CalendarCell) {
    return (
      <div className="space-y-2 min-w-0">
        {cell.items.slice(0, previewLimit).map((item) => {
          const selected =
            selection?.resourceId === row.id &&
            selection.date === cell.date &&
            selection.itemId === item.id;
          return (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={selected}
              aria-label={`${item.title}, ${cell.label}, ${item.time}, ${item.status}`}
              className={cn(
                'h-auto min-h-11 w-full min-w-0 justify-start whitespace-normal text-left p-2.5 shadow-none transition-colors',
                itemColors[item.tone],
                selected && 'ring-2 ring-blue-500 ring-offset-1',
              )}
              onClick={(event) => {
                openFrom(event.currentTarget);
                props.onSelect({ resourceId: row.id, date: cell.date, itemId: item.id });
              }}
            >
              <span className="block min-w-0 w-full">
                <ItemContent item={item} />
              </span>
            </Button>
          );
        })}
        {cell.items.length === 0 && <p className="text-xs text-muted-foreground">{cell.summary}</p>}
        {cell.items.length > previewLimit && (
          <Button
            variant="ghost"
            className="h-auto min-h-11 w-full whitespace-normal text-xs"
            onClick={(event) => {
              openFrom(event.currentTarget);
              props.onSelect({ resourceId: row.id, date: cell.date });
            }}
            aria-expanded={
              selection?.resourceId === row.id && selection.date === cell.date && !selection.itemId
            }
          >
            {cell.summary}
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
                className="min-h-11 w-full whitespace-normal h-auto"
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
            className="table-fixed"
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
