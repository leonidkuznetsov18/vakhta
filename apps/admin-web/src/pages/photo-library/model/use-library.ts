import { useState, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhotoLibraryQuery, type PhotoLibraryEntry } from '@vakhta/contracts';
import { libraryApi } from '../api/library-api';

const initialFilters = { search: '', status: '', from: '', to: '' };
export function useLibrary() {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState<PhotoLibraryQuery>({ page: 1, pageSize: 20, search: '' });
  const [selected, select] = useState<PhotoLibraryEntry | null>(null);
  const input = PhotoLibraryQuery.safeParse({
    ...filters,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });
  const query = useQuery({
    queryKey: ['photo-library', applied],
    queryFn: ({ signal }) => libraryApi.list(applied, signal),
  });
  const data = query.data;
  const page = data?.page ?? applied.page;
  const size = applied.pageSize;
  const total = data?.total ?? 0;
  const canReset =
    Object.values(filters).some((value) => value !== '') ||
    Boolean(applied.search || applied.status || applied.from || applied.to);
  const canApply =
    input.success &&
    (input.data.search !== applied.search ||
      input.data.status !== applied.status ||
      input.data.from !== applied.from ||
      input.data.to !== applied.to);
  return {
    filters,
    selected,
    select,
    query,
    valid: input.success,
    canReset,
    canApply,
    change: (key: keyof typeof filters, value: string) =>
      setFilters((old) => ({ ...old, [key]: value })),
    apply: () => {
      if (canApply && input.success) setApplied({ ...input.data, page: 1, pageSize: size });
    },
    reset: () => {
      if (!canReset) return;
      setFilters(initialFilters);
      setApplied({ page: 1, pageSize: size, search: '' });
    },
    pages: {
      size,
      page,
      pages: Math.max(1, Math.ceil(total / size)),
      from: total ? (page - 1) * size + 1 : 0,
      to: Math.min(page * size, total),
      setSize: (next: SetStateAction<number>) =>
        setApplied((old) => ({
          ...old,
          page: 1,
          pageSize: typeof next === 'function' ? next(old.pageSize) : next,
        })),
      setPage: (next: number) => setApplied((old) => ({ ...old, page: next })),
    },
  };
}
