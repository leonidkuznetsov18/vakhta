import { useQuery } from '@tanstack/react-query';
import {
  Outlet,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { z } from 'zod';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { FailureState, LoadingState } from '@/shared/ui';
import { CreateTenantPage } from '@/pages/create-tenant';
import { OperatorsPage } from '@/pages/operators';
import { SignInPage } from '@/pages/sign-in';
import { TenantWorkspacePage, type WorkspaceTab } from '@/pages/tenant-workspace';
import { TenantsPage } from '@/pages/tenants';
import { ControlShell } from '@/widgets/control-navigation';

/** Signed-in shell: sidebar with the sections of the prototype; sign-in when no operator session. */
function Shell() {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me, retry: false });
  if (me.isPending && !me.isPaused) return <LoadingState />;
  if (me.isError) {
    const unauthenticated =
      me.error instanceof ControlApiError && (me.error.status === 401 || me.error.status === 403);
    if (unauthenticated) return <SignInPage />;
    if (!me.data)
      return (
        <div className="p-6">
          <FailureState onRetry={() => void me.refetch()} />
        </div>
      );
  }
  if (!me.data) return <FailureState onRetry={() => void me.refetch()} />;
  return (
    <ControlShell operator={me.data}>
      {me.isError ? <FailureState onRetry={() => void me.refetch()} /> : null}
      <Outlet />
    </ControlShell>
  );
}

const rootRoute = createRootRoute({ component: Shell });
const tenantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TenantsPage,
});
const createRoute_ = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tenants/new',
  component: CreateTenantPage,
});
const workspaceSearch = z.object({
  tab: z
    .enum([
      'overview',
      'modules',
      'database',
      'bot',
      'domains',
      'parameters',
      'branding',
      'jobs',
      'audit',
      'danger',
    ])
    .default('overview'),
});
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tenants/$id',
  validateSearch: workspaceSearch,
  component: function Workspace() {
    const { id } = workspaceRoute.useParams();
    const { tab } = workspaceRoute.useSearch();
    return <TenantWorkspacePage id={id} tab={tab as WorkspaceTab} />;
  },
});
const operatorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/operators',
  component: OperatorsPage,
});

const routeTree = rootRoute.addChildren([
  tenantsRoute,
  createRoute_,
  workspaceRoute,
  operatorsRoute,
]);

export function createControlRouter() {
  return createRouter({ routeTree, history: createHashHistory() });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createControlRouter>;
  }
}
