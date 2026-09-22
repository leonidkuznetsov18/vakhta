import { createContext, useContext, type ReactNode } from 'react';
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  RouterContextProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as base, screen, type RenderOptions } from '@testing-library/react';
import { afterEach } from 'vitest';
import { NavigationProvider } from '@/navigation';
import { navigationOptions } from '@/app/router/navigation-options';

// Page fixtures use real matching/history and preserve their component on rerender. The full shell
// suite tests the production route tree, redirects, authentication and navigation blocking.
const Content = createContext<ReactNode>(null);
function TestContent() {
  return useContext(Content);
}
const root = createRootRoute();
const paths = [
  '/',
  '/overview',
  '/schedule',
  '/operations/{-$id}',
  '/handover/{-$id}',
  '/requests/{-$id}',
  '/incidents/{-$id}',
  '/incidents/statistics',
  '/bonus/{-$id}',
  '/administration/{-$tab}/{-$detail}',
  '/audit/{-$tab}',
  '/$',
] as const;
const routeTree = root.addChildren(
  paths.map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: TestContent,
    }),
  ),
);
function createTestRouter() {
  const router = createRouter({ routeTree, history: createHashHistory() });
  histories.add(router.history);
  return router;
}
const histories = new Set<ReturnType<typeof createTestRouter>['history']>();
afterEach(() => {
  for (const history of histories) history.destroy();
  histories.clear();
});

export async function renderRouted(ui: ReactNode, options?: RenderOptions) {
  const router = createTestRouter();
  await router.load();
  return render(ui, options, router);
}

/** Query and router instances are isolated per test; rerender retains both providers. */
export function render(
  ui: ReactNode,
  options?: RenderOptions,
  loadedRouter?: ReturnType<typeof createTestRouter>,
) {
  const router = loadedRouter ?? createTestRouter();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    router,
    ...base(ui, {
      ...options,
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <NavigationProvider
            go={(section, sub) => {
              void router.navigate(navigationOptions(section, sub));
            }}
          >
            {loadedRouter ? (
              <Content value={children}>
                <RouterProvider router={router} />
              </Content>
            ) : (
              <RouterContextProvider router={router}>{children}</RouterContextProvider>
            )}
          </NavigationProvider>
        </QueryClientProvider>
      ),
    }),
  };
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
