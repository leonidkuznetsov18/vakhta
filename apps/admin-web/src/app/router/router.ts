import { createHashHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import type { SectionKey } from '@/navigation';
import { routeTree } from './routes';

export function createPanelRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history, defaultPreload: false, scrollRestoration: true });
}
export type PanelRouter = ReturnType<typeof createPanelRouter>;
declare module '@tanstack/react-router' {
  interface Register {
    router: PanelRouter;
  }
  interface StaticDataRouteOption {
    section?: SectionKey | 'profile';
  }
}
