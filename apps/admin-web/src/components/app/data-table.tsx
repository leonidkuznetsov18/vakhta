import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { format, messages } from '@vakhta/i18n';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  SearchIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/app/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePersistentState } from '@/lib/persistent-state';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
  readonly align?: 'left' | 'right';
  /** Value used for sorting; when absent the column is not sortable. */
  readonly sortValue?: (row: T) => string | number | null | undefined;
  /** Plain-text label for the card layout on narrow screens; defaults to `header` when it is a string. */
  readonly label?: string;
  /** Drop the column from the card layout on narrow screens. */
  readonly hideOnCards?: boolean;
}

/** One entry of the per-row "⋯" menu. `separator` draws a line before the entry. */
export interface RowAction {
  readonly key: string;
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly icon?: LucideIcon;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly separator?: boolean;
}

interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty: string;
  /** Extra text and a call to action under the empty message. */
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  /** While true and there are no rows, skeleton rows are drawn instead of the empty state. */
  readonly loading?: boolean;
  readonly pageSize?: number;
  /** Remembers page size, search and sort across reloads under this key. */
  readonly storageKey?: string;
  /** Text to match the search box against; enables the box when given. */
  readonly searchText?: (row: T) => string;
  readonly searchPlaceholder?: string;
  readonly rowClassName?: (row: T) => string | undefined;
  /** Extra full-width row rendered under a data row (details, inline forms). */
  readonly expanded?: (row: T) => ReactNode | null;
  /** Main action of a row: clicking anywhere on it (outside controls) triggers this. */
  readonly onRowClick?: (row: T) => void;
  /** Secondary actions in a "⋯" menu at the end of the row. */
  readonly rowActions?: (row: T) => readonly RowAction[];
  readonly footer?: ReactNode;
  readonly caption?: string;
  /** Row currently highlighted (the one open in a side panel). */
  readonly activeKey?: string | null;
  /** Checkboxes per row for bulk actions; the parent owns the selection. */
  readonly selectedKeys?: ReadonlySet<string>;
  readonly onSelectionChange?: (keys: Set<string>) => void;
  /** Rendered above the table while something is selected (the bulk action bar). */
  readonly selectionBar?: ReactNode;
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

interface Sort {
  readonly key: string;
  readonly dir: 'asc' | 'desc';
}

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
              {a.icon ? <a.icon aria-hidden="true" /> : null}
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side paginated table. Every list in the panel goes through it so long lists never
 * render at once and the controls look and behave the same everywhere: a click on the row
 * runs its main action, the "⋯" menu holds the rest, headers sort, the search box filters,
 * and on narrow screens the rows become cards.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  emptyDescription,
  emptyAction,
  loading = false,
  pageSize = DEFAULT_PAGE_SIZE,
  storageKey,
  searchText,
  searchPlaceholder,
  rowClassName,
  expanded,
  onRowClick,
  rowActions,
  footer,
  caption,
  activeKey,
  selectedKeys,
  onSelectionChange,
  selectionBar,
}: DataTableProps<T>) {
  const t = messages(currentLocale()).ui.common;
  const isMobile = useIsMobile();
  const [search, setSearch] = usePersistentState(
    storageKey ? `search.${storageKey}` : '__local.search',
    '',
  );
  const [sort, setSort] = usePersistentState<Sort | null>(
    storageKey ? `sort.${storageKey}` : '__local.sort',
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((row) => searchText(row).toLowerCase().includes(q));
  }, [rows, search, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const value = col?.sortValue;
    if (!value) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compare(value(a), value(b)));
  }, [filtered, sort, columns]);

  const pages = usePages(sorted.length, pageSize, storageKey);
  const visible = useMemo(
    () => sorted.slice((pages.page - 1) * pages.size, pages.page * pages.size),
    [sorted, pages.page, pages.size],
  );
  const selectable = selectedKeys !== undefined && onSelectionChange !== undefined;
  const span = columns.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0);
  const toggleKey = (key: string, on: boolean) => {
    if (!selectedKeys || !onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (on) next.add(key);
    else next.delete(key);
    onSelectionChange(next);
  };
  const allVisibleSelected =
    selectable && visible.length > 0 && visible.every((row) => selectedKeys.has(rowKey(row)));

  if (rows.length === 0 && loading) return <TableSkeleton columns={span} />;
  if (rows.length === 0)
    return <EmptyState text={empty} description={emptyDescription} action={emptyAction} />;

  const handleRowClick = (row: T) => (ev: MouseEvent<HTMLElement>) => {
    if (!onRowClick || isInteractive(ev.target)) return;
    onRowClick(row);
  };
  const handleRowKey = (row: T) => (ev: KeyboardEvent<HTMLElement>) => {
    if (onRowClick && ev.target === ev.currentTarget && ev.key === 'Enter') onRowClick(row);
  };
  const toggleSort = (key: string) => {
    setSort((cur) =>
      cur?.key === key ? (cur.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' },
    );
    pages.setPage(1);
  };

  const searchBox = searchText ? (
    <div className="relative w-full max-w-sm">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          pages.setPage(1);
        }}
        placeholder={searchPlaceholder ?? t.searchPlaceholder}
        aria-label={searchPlaceholder ?? t.searchPlaceholder}
        className="pl-8"
      />
    </div>
  ) : null;

  const body =
    sorted.length === 0 ? (
      <EmptyState text={t.noMatches} />
    ) : (
      <>
        {!isMobile && (
          <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-lg border">
            <Table>
              {caption ? <caption className="sr-only">{caption}</caption> : null}
              <TableHeader>
                <TableRow>
                  {selectable ? (
                    <TableHead className="w-8">
                      <Checkbox
                        aria-label={t.selectAll}
                        checked={allVisibleSelected}
                        onCheckedChange={(on) => {
                          const next = new Set(selectedKeys);
                          for (const row of visible) {
                            if (on === true) next.add(rowKey(row));
                            else next.delete(rowKey(row));
                          }
                          onSelectionChange?.(next);
                        }}
                      />
                    </TableHead>
                  ) : null}
                  {columns.map((c) => (
                    <TableHead
                      key={c.key}
                      className={cn(c.align === 'right' && 'text-right', c.className)}
                      aria-sort={
                        sort?.key === c.key
                          ? sort.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            c.align === 'right' && 'flex-row-reverse',
                          )}
                          onClick={() => toggleSort(c.key)}
                          aria-label={
                            sort?.key === c.key && sort.dir === 'asc' ? t.sortDesc : t.sortAsc
                          }
                        >
                          {c.header}
                          {sort?.key === c.key ? (
                            sort.dir === 'asc' ? (
                              <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDownIcon className="size-3.5 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
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
                  const key = rowKey(row);
                  const extra = expanded?.(row);
                  const actions = rowActions?.(row) ?? [];
                  return (
                    <RowGroup key={key}>
                      <TableRow
                        className={cn(
                          onRowClick && 'cursor-pointer',
                          activeKey === key && 'bg-accent/60',
                          rowClassName?.(row),
                        )}
                        data-state={activeKey === key ? 'selected' : undefined}
                        onClick={handleRowClick(row)}
                        onKeyDown={handleRowKey(row)}
                        tabIndex={onRowClick ? 0 : undefined}
                      >
                        {selectable ? (
                          <TableCell className="w-8">
                            <Checkbox
                              aria-label={key}
                              checked={selectedKeys.has(key)}
                              onCheckedChange={(on) => toggleKey(key, on === true)}
                            />
                          </TableCell>
                        ) : null}
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
        )}
        {isMobile && (
          <ul className="flex flex-col gap-2" aria-label={caption}>
            {visible.map((row) => {
              const key = rowKey(row);
              const [first, ...rest] = columns;
              const extra = expanded?.(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <li
                  key={key}
                  className={cn(
                    'rounded-lg border bg-card p-3 text-sm',
                    onRowClick && 'cursor-pointer',
                    activeKey === key && 'ring-2 ring-ring',
                    rowClassName?.(row),
                  )}
                  onClick={handleRowClick(row)}
                  onKeyDown={handleRowKey(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    {selectable ? (
                      <Checkbox
                        aria-label={key}
                        checked={selectedKeys.has(key)}
                        onCheckedChange={(on) => toggleKey(key, on === true)}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 font-medium">
                      {first ? first.cell(row) : null}
                    </div>
                    {rowActions ? <RowMenu actions={actions} label={t.actions} /> : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {rest
                      .filter((c) => !c.hideOnCards)
                      .map((c) => (
                        <RowGroup key={c.key}>
                          <dt className="text-xs text-muted-foreground">
                            {c.label ?? (typeof c.header === 'string' ? c.header : '')}
                          </dt>
                          <dd className="min-w-0">{c.cell(row)}</dd>
                        </RowGroup>
                      ))}
                  </dl>
                  {extra ? <div className="mt-3 border-t pt-3">{extra}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </>
    );

  return (
    <div className="flex flex-col gap-3">
      {searchBox}
      {selectable && selectedKeys.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="tabular-nums">{format(t.selected, { n: selectedKeys.size })}</span>
          {selectionBar}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onSelectionChange?.(new Set())}
          >
            {t.clearSelection}
          </Button>
        </div>
      ) : null}
      {body}
      <Paginator pages={pages} total={sorted.length} />
    </div>
  );
}

/** Placeholder rows while the first page loads; the same height as real rows so nothing jumps. */
function TableSkeleton({ columns }: { readonly columns: number }) {
  const t = messages(currentLocale()).ui.common;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" role="status" aria-busy="true">
      <span className="sr-only">{t.loading_rows}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: Math.min(columns, 6) }, (_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Keeps a data row and its expanded row adjacent without an extra DOM wrapper in the table. */
function RowGroup({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
