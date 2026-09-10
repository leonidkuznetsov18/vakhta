import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as base, screen, type RenderOptions } from '@testing-library/react';

/**
 * Renders a screen the way the app does, with a query client of its own: every page reads its data
 * through TanStack Query, and a client per test keeps one test's cache out of the next one's.
 * Retries are off so a deliberate failure fails once, immediately.
 */
export function render(ui: ReactNode, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  // Passed as `wrapper` rather than wrapped by hand, so `rerender` keeps the same provider and the
  // tree under test is updated instead of thrown away and mounted again.
  return base(ui, {
    ...options,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

/**
 * Activates an entry of the n-th row menu. The test setup replaces the Radix dropdown with a
 * plain list of `menuitem` buttons, so the entry is clickable without opening anything.
 */
export async function clickRowAction(label: string, index = 0): Promise<void> {
  const items = await screen.findAllByRole('menuitem', { name: label });
  const item = items[index];
  if (!item) throw new Error(`Row action "${label}" #${index} not found`);
  fireEvent.click(item);
}
