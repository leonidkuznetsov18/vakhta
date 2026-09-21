import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { LOCALES, currentLocale, setLocale, t } from '@/shared/i18n';
import { FailureState, LoadingState } from '@/shared/ui';
import { CreateTenantPage } from '@/pages/create-tenant';
import { OperatorsPage } from '@/pages/operators';
import { SignInPage } from '@/pages/sign-in';
import { TenantWorkspacePage, type WorkspaceTab } from '@/pages/tenant-workspace';
import { TenantsPage } from '@/pages/tenants';

const LOCALE_LABELS: Record<string, string> = { uk: 'UA', en: 'EN', ru: 'РУ' };

/** Signed-in shell: sidebar with the sections of the prototype; sign-in when no operator session. */
function Shell() {
  const m = t();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me, retry: false });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  const nav: { to: '/' | '/operators'; label: string }[] = [
    { to: '/', label: m.nav.tenants },
    { to: '/operators', label: m.nav.operators },
  ];
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <nav
        aria-label={m.productName}
        className="flex w-full shrink-0 flex-col gap-1 bg-neutral-900 p-4 text-neutral-200 md:w-56"
      >
        <div className="mb-4 px-2 text-lg font-semibold text-white">{m.productName}</div>
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`rounded-md px-3 py-2 text-sm ${pathname === item.to ? 'bg-sky-600 text-white' : 'hover:bg-neutral-800'}`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400 md:mt-auto md:flex-col md:items-stretch">
          <div className="flex gap-1">
            {LOCALES.map((locale) => (
              <button
                key={locale}
                type="button"
                lang={locale}
                aria-pressed={locale === currentLocale()}
                className={`rounded px-2 py-1 ${locale === currentLocale() ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-800'}`}
                onClick={() => setLocale(locale)}
              >
                {LOCALE_LABELS[locale]}
              </button>
            ))}
          </div>
          <div className="truncate">{me.data.email}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-neutral-300"
            onClick={() => {
              void controlApi
                .signOut()
                .then(() => navigate({ to: '/' }))
                .then(() => location.reload());
            }}
          >
            {m.nav.signOut}
          </Button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-4 [overflow-wrap:anywhere] sm:p-6 lg:p-8">
        {me.isError ? <FailureState onRetry={() => void me.refetch()} /> : null}
        <Outlet />
      </main>
    </div>
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
