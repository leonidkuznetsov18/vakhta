import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { format, messages } from '@vakhta/i18n';
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
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
  readonly align?: 'left' | 'right';
}

interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty: string;
  readonly pageSize?: number;
  readonly rowClassName?: (row: T) => string | undefined;
  /** Extra full-width row rendered under a data row (details, inline forms). */
  readonly expanded?: (row: T) => ReactNode | null;
  readonly footer?: ReactNode;
  readonly caption?: string;
}

const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Client-side paginated table. Every list in the panel goes through it so long lists never
 * render at once and the controls look and behave the same everywhere.
 */
/** Page state shared by DataTable and other paginated views (the schedule grid). */
export function usePages(total: number, initialSize: number) {
  const [size, setSize] = useState(initialSize);
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
          <NativeSelect>
            <select
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
            </select>
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

/**
 * Client-side paginated table. Every list in the panel goes through it so long lists never
 * render at once and the controls look and behave the same everywhere.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  pageSize = 25,
  rowClassName,
  expanded,
  footer,
  caption,
}: DataTableProps<T>) {
  const pages = usePages(rows.length, pageSize);
  const visible = useMemo(
    () => rows.slice((pages.page - 1) * pages.size, pages.page * pages.size),
    [rows, pages.page, pages.size],
  );

  if (rows.length === 0) return <EmptyState text={empty} />;

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const extra = expanded?.(row);
              return (
                <RowGroup key={rowKey(row)}>
                  <TableRow className={rowClassName?.(row)}>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(c.align === 'right' && 'text-right', c.className)}
                      >
                        {c.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {extra ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="bg-muted/40 p-4">
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
