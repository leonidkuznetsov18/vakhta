import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { format, messages } from '@vakhta/i18n';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/app/page';
import { usePersistentState } from '@/lib/persistent-state';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
  readonly align?: 'left' | 'right';
}

/** One entry of the per-row "⋯" menu. `separator` draws a line before the entry. */
export interface RowAction {
  readonly key: string;
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly separator?: boolean;
}

interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty: string;
  readonly pageSize?: number;
  /** Remembers the chosen page size across reloads under this key. */
  readonly storageKey?: string;
  readonly rowClassName?: (row: T) => string | undefined;
  /** Extra full-width row rendered under a data row (details, inline forms). */
  readonly expanded?: (row: T) => ReactNode | null;
  /** Main action of a row: clicking anywhere on it (outside controls) triggers this. */
  readonly onRowClick?: (row: T) => void;
  /** Secondary actions in a "⋯" menu at the end of the row. */
  readonly rowActions?: (row: T) => readonly RowAction[];
  readonly footer?: ReactNode;
  readonly caption?: string;
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

/** Page state shared by DataTable and other paginated views (the schedule grid). */
export function usePages(total: number, initialSize: number, storageKey?: string) {
  const [size, setSize] = usePersistentState(
    storageKey ? `pageSize.${storageKey}` : `pageSize.__local.${initialSize}`,
    initialSize,
  );
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return { size, setSize, page, setPage, pages, from, to };
}

export type Pages = ReturnType<typeof usePages>;

/** Footer with the visible range, page size and previous/next; hidden while everything fits. */
export function Paginator({ pages: p, total }: { readonly pages: Pages; readonly total: number }) {
  const t = messages(currentLocale()).ui.pagination;
  if (total <= PAGE_SIZES[0]) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{format(t.showing, { from: p.from, to: p.to, total })}</span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span>{t.pageSize}</span>
          <NativeSelect
            size="sm"
            value={p.size}
            onChange={(e) => {
              p.setSize(Number(e.target.value));
              p.setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <NativeSelectOption key={n} value={n}>
                {n}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={p.page <= 1}
                className={cn(p.page <= 1 && 'pointer-events-none opacity-50')}
                onClick={(e) => {
                  e.preventDefault();
                  p.setPage(Math.max(1, p.page - 1));
                }}
              >
                {t.previous}
              </PaginationPrevious>
            </PaginationItem>
            <PaginationItem className="px-2 text-sm tabular-nums">
              {format(t.page, { page: p.page, pages: p.pages })}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={p.page >= p.pages}
                className={cn(p.page >= p.pages && 'pointer-events-none opacity-50')}
                onClick={(e) => {
                  e.preventDefault();
                  p.setPage(Math.min(p.pages, p.page + 1));
                }}
              >
                {t.next}
              </PaginationNext>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

/** A click on a control inside the row must not also fire the row's main action. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'button, a, input, select, textarea, label, [role="menuitem"], [role="menu"]',
    ) !== null
  );
}

/** "⋯" menu with the secondary actions of a row. */
export function RowMenu({
  actions,
  label,
}: {
  readonly actions: readonly RowAction[];
  readonly label: string;
}) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <div key={a.key}>
            {a.separator ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={a.disabled}
              variant={a.destructive ? 'destructive' : 'default'}
              onSelect={() => a.onSelect()}
            >
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Client-side paginated table. Every list in the panel goes through it so long lists never
 * render at once and the controls look and behave the same everywhere: a click on the row
 * runs its main action, the "⋯" menu holds the rest.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  pageSize = DEFAULT_PAGE_SIZE,
  storageKey,
  rowClassName,
  expanded,
  onRowClick,
  rowActions,
  footer,
  caption,
}: DataTableProps<T>) {
  const t = messages(currentLocale()).ui.common;
  const pages = usePages(rows.length, pageSize, storageKey);
  const visible = useMemo(
    () => rows.slice((pages.page - 1) * pages.size, pages.page * pages.size),
    [rows, pages.page, pages.size],
  );
  const span = columns.length + (rowActions ? 1 : 0);

  if (rows.length === 0) return <EmptyState text={empty} />;

  const handleRowClick = (row: T) => (ev: MouseEvent<HTMLTableRowElement>) => {
    if (!onRowClick || isInteractive(ev.target)) return;
    onRowClick(row);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(c.align === 'right' && 'text-right', c.className)}
                >
                  {c.header}
                </TableHead>
              ))}
              {rowActions ? (
                <TableHead className="w-10 text-right">
                  <span className="sr-only">{t.actions}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const extra = expanded?.(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <RowGroup key={rowKey(row)}>
                  <TableRow
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                    onClick={handleRowClick(row)}
                    onKeyDown={(ev) => {
                      if (onRowClick && ev.target === ev.currentTarget && ev.key === 'Enter') {
                        onRowClick(row);
                      }
                    }}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(c.align === 'right' && 'text-right', c.className)}
                      >
                        {c.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell className="text-right">
                        <RowMenu actions={actions} label={t.actions} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                  {extra ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={span} className="bg-muted/40 p-4">
                        {extra}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </RowGroup>
              );
            })}
            {footer}
          </TableBody>
        </Table>
      </div>
      <Paginator pages={pages} total={rows.length} />
    </div>
  );
}

/** Keeps a data row and its expanded row adjacent without an extra DOM wrapper in the table. */
function RowGroup({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
