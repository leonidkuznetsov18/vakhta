import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from './use-library';

vi.mock('../api/library-api', () => ({
  libraryApi: {
    list: vi.fn().mockResolvedValue({ page: 1, pageSize: 20, total: 0, rows: [] }),
  },
}));

afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(useLibrary, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('photo library filter availability', () => {
  it.each([
    ['search', 'Zone A'],
    ['status', 'PROBLEMS'],
    ['from', '2026-09-10'],
    ['to', '2026-09-11'],
  ] as const)('tracks draft and applied %s independently', (key, value) => {
    const { result } = setup();
    act(() => result.current.change(key, value));
    expect(result.current.canReset).toBe(true);
    expect(result.current.canApply).toBe(true);
    act(() => result.current.apply());
    expect(result.current.canApply).toBe(false);
    expect(result.current.canReset).toBe(true);
    act(() => result.current.change(key, ''));
    expect(result.current.canApply).toBe(true);
    expect(result.current.canReset).toBe(true);
    act(() => result.current.reset());
    expect(result.current.canApply).toBe(false);
    expect(result.current.canReset).toBe(false);
    expect(result.current.filters[key]).toBe('');
  });

  it('allows clearing invalid dates while preventing their submission', () => {
    const { result } = setup();
    act(() => {
      result.current.change('from', '2026-09-11');
      result.current.change('to', '2026-09-10');
    });
    expect(result.current.canApply).toBe(false);
    expect(result.current.canReset).toBe(true);
    act(() => result.current.apply());
    act(() => result.current.reset());
    expect(result.current.valid).toBe(true);
    expect(result.current.canReset).toBe(false);
    expect(result.current.canApply).toBe(false);
  });
});
