import {
  rowPaginationFeature,
  createPaginatedRowModel,
  useTable,
  tableFeatures,
  globalFilteringFeature,
  columnFilteringFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
} from '@tanstack/react-table';

export interface TableSort {
  readonly key: string;
  readonly dir: 'asc' | 'desc';
}
export interface SortableColumn<T> {
  readonly key: string;
  readonly sortValue?: (row: T) => string | number | null | undefined;
}
const features = tableFeatures({
  globalFilteringFeature,
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** TanStack owns row processing; persisted filter/sort values remain in the caller's Zustand model. */
export function useTableRows<T extends object>({
  rows,
  columns,
  rowKey,
  search,
  sort,
  searchText,
}: {
  readonly rows: readonly T[];
  readonly columns: readonly SortableColumn<T>[];
  readonly rowKey: (row: T) => string;
  readonly search: string;
  readonly sort: TableSort | null;
  readonly searchText?: (row: T) => string;
}) {
  const validSort =
    sort && columns.some((column) => column.key === sort.key && column.sortValue) ? sort : null;
  const table = useTable({
    features,
    data: rows,
    columns: [
      ...columns.map((column) => ({
        id: column.key,
        accessorFn: column.sortValue ?? (() => undefined),
        enableSorting: Boolean(column.sortValue),
        enableGlobalFilter: false,
        sortFn: (a: { original: T }, b: { original: T }) =>
          compare(column.sortValue?.(a.original), column.sortValue?.(b.original)),
      })),
      { id: '__table_search', accessorFn: searchText ?? (() => ''), enableSorting: false },
    ],
    getRowId: rowKey,
    globalFilterFn: 'includesString',
    state: {
      globalFilter: searchText ? search.trim() : '',
      sorting: validSort ? [{ id: validSort.key, desc: validSort.dir === 'desc' }] : [],
    },
  });
  return table.getRowModel().rows.map((row) => row.original);
}

const paginationFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

/** Pagination follows filtering/sorting and deep-link page resolution; no duplicate search state. */
export function useTablePage<T extends object>(
  rows: readonly T[],
  rowKey: (row: T) => string,
  page: number,
  size: number,
) {
  const table = useTable({
    features: paginationFeatures,
    columns: [],
    data: rows,
    getRowId: rowKey,
    autoResetPageIndex: false,
    state: { pagination: { pageIndex: page - 1, pageSize: size } },
  });
  return table.getRowModel().rows.map((row) => row.original);
}
