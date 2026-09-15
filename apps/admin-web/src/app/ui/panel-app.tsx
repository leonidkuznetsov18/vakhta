import { RouterProvider } from '@tanstack/react-router';
import type { PanelRouter } from '../router/router';

export function PanelApp({ router }: { router: PanelRouter }) {
  return <RouterProvider router={router} />;
}
