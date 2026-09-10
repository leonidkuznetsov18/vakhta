import { QueryFeedback, type QueryFeedbackState } from './query-feedback';
import { RowDetail } from './row-detail';
import { useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { format, messages } from '@vakhta/i18n';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LoadingState } from '@/shared/ui/loading-state';
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
import { usePersistentState } from '@/lib/ui-store';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';
import { useTablePage, useTableRows } from '@/shared/lib/table-model';

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
  /** Minimum readable width on desktop; cards remain fluid. */
  readonly minWidth?: string;
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
  /** While true and there are no rows, a spinner is drawn instead of the empty state. */
  readonly loading?: boolean;
  readonly queryState?: QueryFeedbackState;
  /** When the same query feeds several tables, the parent may render one shared feedback. */
  readonly queryFeedback?: boolean;
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
  readonly summary?: readonly { readonly label: string; readonly value: ReactNode }[];
  readonly primaryKey?: string;
  readonly rowLabel?: (row: T) => string;
  /** External dataset filters, excluding background refreshes. */
  readonly resetKey?: string;
  /** A capped response cannot claim to be the full archive. */
  readonly truncated?: boolean;
  readonly totalCount?: number;
  /** Server-owned pages: rows already contain exactly the requested page. */
  readonly pagination?: Pages;
  readonly caption?: string;
  /** Row currently highlighted (the one open inline). */
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

/**
 * Page state shared by DataTable and other paginated views (the schedule grid).
 *
 * `anchor` is the index of a row that must be on screen — the one the address points at. The page
 * holding it wins until the reader turns a page themselves, and the page is clamped as the list
 * shrinks, so nothing has to be corrected after the fact.
 */
export function usePages(
  total: number,
  initialSize: number,
  storageKey?: string,
  anchor = -1,
  resetKey = '',
) {
  const instanceId = useId();
  const [storedSize, setSize] = usePersistentState(
    storageKey ? `pageSize.${storageKey}` : `pageSize.${instanceId}`,
    initialSize,
  );
  const size = PAGE_SIZES.some((n) => n === storedSize) ? storedSize : DEFAULT_PAGE_SIZE;
  const [chosen, setChosen] = useState<{
    readonly page: number;
    readonly anchor: number;
    readonly scope: string;
  } | null>(null);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = chosen?.scope === resetKey ? chosen : null;
  const wanted =
    current?.anchor === anchor
      ? current.page
      : anchor >= 0
        ? Math.floor(anchor / size) + 1
        : (current?.page ?? 1);
  const page = Math.min(Math.max(1, wanted), pages);
  const setPage = (next: number) => setChosen({ page: next, anchor, scope: resetKey });
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return { size, setSize, page, setPage, pages, from, to };
}

/**
 * Brings the row the address points at into view as it mounts. "nearest" scrolls the least it can
 * and does nothing at all when the row is already on screen, which is the whole intent: no page
 * moves under anyone. Defined once, so React attaches it when the active row changes and at no
 * other time — a live screen must not fight the reader for the scroll on every refresh.
 */
function showActiveRow(el: HTMLElement | null): void {
  if (!el) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  el.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
}

export type Pages = ReturnType<typeof usePages>;

/** The complete filtered count, independent of the number of rows on the current page. */
export function TableCount({
  total,
  from = total ? 1 : 0,
  to = total,
}: {
  readonly total: number;
  readonly from?: number;
  readonly to?: number;
}) {
  return (
    <span className="text-sm tabular-nums text-muted-foreground">
      {format(messages(currentLocale()).ui.pagination.showing, { from, to, total })}
    </span>
  );
}

/** Always show the count; page controls are only needed for larger collections. */
export function Paginator({
  pages: p,
  total,
  totalCount = total,
}: {
  readonly pages: Pages;
  readonly total: number;
  readonly totalCount?: number;
}) {
  const t = messages(currentLocale()).ui.pagination;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <TableCount total={totalCount} from={p.from} to={p.to} />
      {total > Math.min(PAGE_SIZES[0], p.size) && (
        <div className="flex flex-wrap items-center gap-3">
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
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t.previous}
                  disabled={p.page <= 1}
                  onClick={() => p.setPage(p.page - 1)}
                >
                  <ChevronLeftIcon aria-hidden="true" />
                  <span className="hidden sm:inline">{t.previous}</span>
                </Button>
              </PaginationItem>
              <PaginationItem className="px-2 text-sm tabular-nums">
                {format(t.page, { page: p.page, pages: p.pages })}
              </PaginationItem>
              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t.next}
                  disabled={p.page >= p.pages}
                  onClick={() => p.setPage(p.page + 1)}
                >
                  <span className="hidden sm:inline">{t.next}</span>
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

/** Plain textual cells wrap within a readable measure; structured controls keep their own layout. */
function cellContent(content: ReactNode): ReactNode {
  return (
    <div className="min-w-0 max-w-sm whitespace-normal [overflow-wrap:anywhere]">{content}</div>
  );
}

function columnLabel<T>(column: Column<T>): string {
  return column.label ?? (typeof column.header === 'string' ? column.header : column.key);
}

/** A click on a control inside the row must not also fire the row's main action. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'button, a, input, select, textarea, label, [role="menuitem"], [role="menu"], [data-row-detail]',
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

/**
 * Client-side paginated table. Every list in the panel goes through it so long lists never
 * render at once and the controls look and behave the same everywhere: a click on the row
 * runs its main action, the "⋯" menu holds the rest, headers sort, the search box filters,
 * and on narrow screens the rows become cards.
 */
export function DataTable<T extends object>({
  columns,
  rows,
  rowKey,
  empty,
  emptyDescription,
  emptyAction,
  loading = false,
  queryState,
  queryFeedback = true,
  pageSize = DEFAULT_PAGE_SIZE,
  storageKey,
  searchText,
  searchPlaceholder,
  rowClassName,
  expanded,
  onRowClick,
  rowActions,
  summary,
  primaryKey,
  rowLabel,
  resetKey = '',
  truncated = false,
  totalCount,
  pagination,
  caption,
  activeKey,
  selectedKeys,
  onSelectionChange,
  selectionBar,
}: DataTableProps<T>) {
  const t = messages(currentLocale()).ui.common;
  const isMobile = useIsMobile();
  const instanceId = useId();
  const namespace = storageKey ?? instanceId;
  const primary = columns.find((c) => c.key === primaryKey) ?? columns[0];
  const labelFor = (row: T) =>
    rowLabel?.(row) ??
    String(
      primary?.sortValue?.(row) ??
        (typeof primary?.cell(row) === 'string' ? primary.cell(row) : rowKey(row)),
    );
  const tableName = caption ?? columns.map(columnLabel).join(', ');
  const [search, setSearch] = usePersistentState(`search.${namespace}`, '');
  const [storedSort, setSort] = usePersistentState<Sort | null>(`sort.${namespace}`, null);

  const sort =
    storedSort &&
    (storedSort.dir === 'asc' || storedSort.dir === 'desc') &&
    columns.some((column) => column.key === storedSort.key && column.sortValue)
      ? storedSort
      : null;

  const sorted = useTableRows({ rows, columns, rowKey, search, sort, searchText });

  // Arriving on a row that is not on the first page, or below the fold, used to look like the link
  // had gone nowhere. The row's own page is the one shown, and the row brings itself into view.
  const activeIndex = activeKey ? sorted.findIndex((row) => rowKey(row) === activeKey) : -1;
  const localPages = usePages(
    sorted.length,
    pageSize,
    namespace,
    activeIndex,
    `${resetKey}:${search}`,
  );
  const pages = pagination ?? localPages;
  const localVisible = useTablePage(sorted, rowKey, pages.page, pages.size);
  const visible = pagination ? sorted : localVisible;

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

  const someVisibleSelected = selectable && visible.some((row) => selectedKeys.has(rowKey(row)));
  const selectPage = (on: boolean) => {
    const next = new Set(selectedKeys);
    for (const row of visible) {
      if (on) next.add(rowKey(row));
      else next.delete(rowKey(row));
    }
    onSelectionChange?.(next);
  };
  const selectionInScope =
    !selectedKeys || [...selectedKeys].every((key) => sorted.some((row) => rowKey(row) === key));
  const selectAll = (
    <Checkbox
      aria-label={t.selectPage}
      checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
      onCheckedChange={(on) => selectPage(on === true)}
    />
  );

  if (rows.length === 0 && queryState?.isPending && queryState.fetchStatus === 'idle')
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t.chooseParameters}
      </p>
    );
  if (rows.length === 0 && queryState?.isError)
    return queryFeedback ? <QueryFeedback query={queryState} /> : null;
  if (rows.length === 0 && queryState?.fetchStatus === 'paused')
    return queryFeedback ? <QueryFeedback query={queryState} /> : null;
  if (rows.length === 0 && (queryState ? queryState.isPending && queryState.isFetching : loading))
    return <LoadingState label={t.loading_rows} className="w-full py-8" />;
  if (rows.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <EmptyState text={empty} description={emptyDescription} action={emptyAction} />
        <TableCount total={0} />
      </div>
    );

  const handleRowClick = (row: T) => (ev: MouseEvent<HTMLElement>) => {
    if (!onRowClick || isInteractive(ev.target)) return;
    onRowClick(row);
  };
  const closeDetail = (row: T) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !onRowClick) return;
    event.preventDefault();
    event.stopPropagation();
    onRowClick(row);
    document.getElementById(`${instanceId}-open-${rowKey(row)}`)?.focus({ preventScroll: true });
  };
  const disclosure = (row: T, isOpen: boolean) =>
    onRowClick ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        id={`${instanceId}-open-${rowKey(row)}`}
        aria-label={`${t.details}: ${labelFor(row)}`}
        aria-expanded={expanded ? isOpen : undefined}
        aria-controls={isOpen ? `${instanceId}-detail-${rowKey(row)}` : undefined}
        onClick={() => onRowClick(row)}
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
        />
      </Button>
    ) : null;
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
          onSelectionChange?.(new Set());
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
          <div
            role="region"
            aria-label={tableName}
            tabIndex={0}
            className="w-full min-w-0 max-w-full overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Table>
              <caption className="sr-only">{tableName}</caption>
              <TableHeader>
                <TableRow>
                  {selectable ? <TableHead className="w-8">{selectAll}</TableHead> : null}
                  {columns.map((c) => (
                    <TableHead
                      key={c.key}
                      style={{ minWidth: c.minWidth ?? (c.align === 'right' ? '5rem' : '9rem') }}
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
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className={cn(
                              'inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                              c.align === 'right' && 'flex-row-reverse',
                            )}
                            onClick={() => toggleSort(c.key)}
                            aria-label={`${columnLabel(c)}: ${sort?.key === c.key ? (sort.dir === 'asc' ? t.sortDesc : t.sortClear) : t.sortAsc}`}
                          >
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
                          {c.header}
                        </span>
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
                        ref={activeKey === key ? showActiveRow : undefined}
                        className={cn(
                          onRowClick && 'cursor-pointer',
                          // Repeated under the selected variant so a row that carries its own
                          // tone (an incident, a shift closed without a checklist) keeps that tone
                          // when it is opened: the plain class alone lost to `data-state=selected`.
                          activeKey === key && 'bg-accent/60 data-[state=selected]:bg-accent/60',
                          rowClassName?.(row),
                        )}
                        data-state={selectedKeys?.has(key) ? 'selected' : undefined}
                        onClick={handleRowClick(row)}
                      >
                        {selectable ? (
                          <TableCell className="w-8">
                            <Checkbox
                              aria-label={labelFor(row)}
                              checked={selectedKeys.has(key)}
                              onCheckedChange={(on) => toggleKey(key, on === true)}
                            />
                          </TableCell>
                        ) : null}
                        {columns.map((c) => (
                          <TableCell
                            key={c.key}
                            style={{
                              minWidth: c.minWidth ?? (c.align === 'right' ? '5rem' : '9rem'),
                            }}
                            className={cn(c.align === 'right' && 'text-right', c.className)}
                          >
                            <div
                              className={cn(
                                'flex items-center gap-2',
                                c.align === 'right' && 'justify-end',
                              )}
                            >
                              {c === primary ? disclosure(row, Boolean(extra)) : null}
                              {cellContent(c.cell(row))}
                            </div>
                          </TableCell>
                        ))}
                        {rowActions ? (
                          <TableCell className="text-right">
                            <RowMenu actions={actions} label={`${t.actions}: ${labelFor(row)}`} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                      {extra ? (
                        <TableRow className="hover:bg-transparent">
                          {/* The detail belongs to its row, so it wears the row's tone: a grey
                              panel under a red row read as a different, calmer thing. */}
                          <TableCell
                            colSpan={span}
                            className={cn('bg-muted/40 p-4', rowClassName?.(row))}
                          >
                            <div id={`${instanceId}-detail-${key}`} onKeyDown={closeDetail(row)}>
                              <RowDetail>{extra}</RowDetail>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </RowGroup>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {isMobile && (
          <ul className="flex flex-col gap-2" aria-label={tableName}>
            {visible.map((row) => {
              const key = rowKey(row);
              const first = primary;
              const rest = columns.filter((column) => column !== first);
              const extra = expanded?.(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <li
                  key={key}
                  ref={activeKey === key ? showActiveRow : undefined}
                  className={cn(
                    'rounded-xl border bg-card p-4 text-base leading-relaxed',
                    onRowClick && 'cursor-pointer',
                    activeKey === key && 'ring-2 ring-ring',
                    rowClassName?.(row),
                  )}
                  onClick={handleRowClick(row)}
                >
                  <div className="flex min-h-10 items-center justify-between gap-2">
                    {selectable ? (
                      <Checkbox
                        aria-label={labelFor(row)}
                        checked={selectedKeys.has(key)}
                        onCheckedChange={(on) => toggleKey(key, on === true)}
                      />
                    ) : null}
                    {disclosure(row, Boolean(extra))}
                    <div className="min-w-0 flex-1 font-medium">
                      {first ? cellContent(first.cell(row)) : null}
                    </div>
                    {rowActions ? (
                      <RowMenu actions={actions} label={`${t.actions}: ${labelFor(row)}`} />
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] gap-x-3 gap-y-2">
                    {rest
                      .filter((c) => !c.hideOnCards)
                      .map((c) => (
                        <RowGroup key={c.key}>
                          <dt className="text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                            {c.label ?? c.header}
                          </dt>
                          <dd className="min-w-0 leading-6">{cellContent(c.cell(row))}</dd>
                        </RowGroup>
                      ))}
                  </dl>
                  {extra ? (
                    <div className="mt-3 border-t pt-3">
                      <div id={`${instanceId}-detail-${key}`} onKeyDown={closeDetail(row)}>
                        <RowDetail>{extra}</RowDetail>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </>
    );

  return (
    <div className="flex flex-col gap-3" aria-busy={queryState?.isFetching || undefined}>
      {queryState && queryFeedback && <QueryFeedback query={queryState} />}
      {searchBox}
      {isMobile && (selectable || columns.some((c) => c.sortValue)) ? (
        <div className="flex flex-wrap items-center gap-3">
          {selectable ? (
            <label className="flex min-h-11 items-center gap-3">
              {selectAll}
              <span className="text-sm">{t.selectPage}</span>
            </label>
          ) : null}
          {columns.some((c) => c.sortValue) ? (
            <label className="flex min-w-0 items-center gap-2">
              <span className="text-sm">{t.sort}</span>
              <NativeSelect
                aria-label={t.sort}
                value={sort ? `${sort.key}:${sort.dir}` : ''}
                onChange={(event) => {
                  const option = event.target.selectedOptions[0];
                  const key = option?.dataset.key;
                  setSort(
                    key
                      ? { key, dir: option?.dataset.direction === 'desc' ? 'desc' : 'asc' }
                      : null,
                  );
                  pages.setPage(1);
                }}
              >
                <NativeSelectOption value="">{t.sortClear}</NativeSelectOption>
                {columns
                  .filter((c) => c.sortValue)
                  .flatMap((c) =>
                    ['asc', 'desc'].map((dir) => (
                      <NativeSelectOption
                        key={`${c.key}:${dir}`}
                        value={`${c.key}:${dir}`}
                        data-key={c.key}
                        data-direction={dir}
                      >
                        {columnLabel(c)} · {dir === 'asc' ? t.sortAsc : t.sortDesc}
                      </NativeSelectOption>
                    )),
                  )}
              </NativeSelect>
            </label>
          ) : null}
        </div>
      ) : null}
      {selectable && selectedKeys.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="tabular-nums">{format(t.selected, { n: selectedKeys.size })}</span>
          {selectionInScope ? selectionBar : <span role="status">{t.selectionChanged}</span>}
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
      {summary ? (
        <section className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <h3 className="text-sm font-semibold">{t.total}</h3>
          <dl aria-label={t.total} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summary.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="font-medium tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {truncated ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t.loadedSubset}
        </p>
      ) : null}
      <Paginator
        pages={pages}
        total={pagination ? (totalCount ?? sorted.length) : sorted.length}
        totalCount={search.trim() ? sorted.length : totalCount}
      />
    </div>
  );
}

/** Keeps a data row and its expanded row adjacent without an extra DOM wrapper in the table. */
function RowGroup({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
