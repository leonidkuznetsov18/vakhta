import { useState, type SetStateAction } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PhotoLibraryQuery, type PhotoLibraryEntry } from '@vakhta/contracts';
import { libraryApi } from '../api/library-api';

const initialFilters = { search: '', status: '', from: '', to: '' };
const initialQuery: PhotoLibraryQuery = { page: 1, pageSize: 20, search: '' };
const SEARCH_PAUSE_MS = 300;

/** Query cancellation owns the timer as well as the request; obsolete searches never reach the API. */
async function waitForSearch(signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, SEARCH_PAUSE_MS);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function parseFilters(filters: typeof initialFilters) {
  return PhotoLibraryQuery.safeParse({
    ...filters,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });
}

export function useLibrary() {
  const [state, setState] = useState({ filters: initialFilters, applied: initialQuery });
  const { filters, applied } = state;
  const [selected, select] = useState<PhotoLibraryEntry | null>(null);
  const query = useQuery({
    queryKey: ['photo-library', applied],
    queryFn: async ({ signal }) => {
      if (applied.search) await waitForSearch(signal);
      return libraryApi.list(applied, signal);
    },
    placeholderData: keepPreviousData,
  });
  const page = query.data?.page ?? applied.page;
  const size = applied.pageSize;
  const total = query.data?.total ?? 0;
  const canReset =
    Object.values(filters).some(Boolean) ||
    Boolean(applied.search || applied.status || applied.from || applied.to);
  return {
    filters,
    selected,
    select,
    query,
    canReset,
    valid: parseFilters(filters).success,
    change: (key: keyof typeof filters, value: string) =>
      setState((old) => {
        const nextFilters = { ...old.filters, [key]: value };
        const parsed = parseFilters(nextFilters);
        const next = parsed.success
          ? { ...parsed.data, page: 1, pageSize: old.applied.pageSize }
          : null;
        const unchanged =
          next &&
          next.search === old.applied.search &&
          next.status === old.applied.status &&
          next.from === old.applied.from &&
          next.to === old.applied.to;
        return { filters: nextFilters, applied: next && !unchanged ? next : old.applied };
      }),
    reset: () => {
      if (!canReset) return;
      setState({ filters: initialFilters, applied: { ...initialQuery, pageSize: size } });
    },
    pages: {
      size,
      page,
      pages: Math.max(1, Math.ceil(total / size)),
      from: total ? (page - 1) * size + 1 : 0,
      to: Math.min(page * size, total),
      setSize: (next: SetStateAction<number>) =>
        setState((old) => ({
          ...old,
          applied: {
            ...old.applied,
            page: 1,
            pageSize: typeof next === 'function' ? next(old.applied.pageSize) : next,
          },
        })),
      setPage: (next: number) =>
        setState((old) => ({ ...old, applied: { ...old.applied, page: next } })),
    },
  };
}
