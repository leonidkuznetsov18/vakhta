import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from './use-library';
import { libraryApi } from '../api/library-api';

vi.mock('../api/library-api', () => ({
  libraryApi: {
    list: vi.fn().mockResolvedValue({ page: 1, pageSize: 20, total: 0, rows: [] }),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(useLibrary, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('automatic photo library filters', () => {
  it.each([
    ['search', 'Zone A'],
    ['status', 'PROBLEMS'],
    ['from', '2026-09-10'],
    ['to', '2026-09-11'],
  ] as const)('applies %s and resets without an explicit submit', async (key, value) => {
    const { result } = setup();
    act(() => result.current.change(key, value));
    expect(result.current.canReset).toBe(true);
    await waitFor(() =>
      expect(libraryApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ [key]: value, page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    act(() => result.current.reset());
    expect(result.current.canReset).toBe(false);
    expect(result.current.filters[key]).toBe('');
  });

  it('cancels obsolete searches before they reach the server, including reset', async () => {
    const { result } = setup();
    await waitFor(() => expect(libraryApi.list).toHaveBeenCalledTimes(1));
    act(() => result.current.change('search', 'Old search'));
    act(() => result.current.change('search', 'Final search'));
    await waitFor(() => expect(libraryApi.list).toHaveBeenCalledTimes(2));
    expect(libraryApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Final search' }),
      expect.any(AbortSignal),
    );
    act(() => result.current.change('search', 'Cancelled'));
    act(() => result.current.reset());
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(
      vi.mocked(libraryApi.list).mock.calls.some(([input]) => input.search === 'Cancelled'),
    ).toBe(false);
  });

  it('keeps the last valid range when dates are inverted and allows resetting', async () => {
    const { result } = setup();
    act(() => result.current.change('from', '2026-09-11'));
    await waitFor(() =>
      expect(libraryApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-09-11' }),
        expect.any(AbortSignal),
      ),
    );
    const count = vi.mocked(libraryApi.list).mock.calls.length;
    act(() => result.current.change('to', '2026-09-10'));
    expect(result.current.valid).toBe(false);
    expect(vi.mocked(libraryApi.list).mock.calls).toHaveLength(count);
    act(() => result.current.reset());
    expect(result.current.valid).toBe(true);
    expect(result.current.canReset).toBe(false);
  });
});
