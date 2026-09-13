import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLiveUpdates } from './live';

class FakeSource {
  static last: FakeSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, () => void>();
  closed = false;
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(event: string, fn: () => void) {
    this.listeners.set(event, fn);
  }
  close() {
    this.closed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLiveUpdates (spec 004 AC-024)', () => {
  it('one stream event marks the list and the overview snapshot stale, and reports connection state', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => useLiveUpdates('/admin/incidents/stream', 'incident', ['incidents'], [['overview']]),
      { wrapper },
    );
    const source = FakeSource.last!;
    expect(result.current).toBe(false);
    act(() => source.onopen?.());
    expect(result.current).toBe(true);
    act(() => source.listeners.get('incident')?.());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['incidents'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] });
    act(() => source.onerror?.());
    expect(result.current).toBe(false);
    unmount();
    expect(source.closed).toBe(true);
  });
});
