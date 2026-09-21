import { useState } from 'react';
import { Dialog } from 'radix-ui';
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
import { Building2, LogOut, ShieldCheck, PanelLeft, X } from 'lucide-react';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { LOCALES, currentLocale, setLocale, t } from '@/shared/i18n';
import { FailureState, LoadingState, IconButton } from '@/shared/ui';
import { CreateTenantPage } from '@/pages/create-tenant';
import { OperatorsPage } from '@/pages/operators';
import { SignInPage } from '@/pages/sign-in';
import { TenantWorkspacePage, type WorkspaceTab } from '@/pages/tenant-workspace';
import { TenantsPage } from '@/pages/tenants';

const LOCALE_NAMES: Record<string, string> = { uk: 'Українська', en: 'English', ru: 'Русский' };
const LOCALE_LABELS: Record<string, string> = { uk: '🇺🇦', en: '🇬🇧', ru: 'РУ' };

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
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <ControlNavigation email={me.data.email} />
      <main className="min-w-0 flex-1 p-4 [overflow-wrap:anywhere] sm:p-6 lg:p-8">
        {me.isError ? <FailureState onRetry={() => void me.refetch()} /> : null}
        <Outlet />
      </main>
    </div>
  );
}

function ControlNavigation({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const m = t();
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-sidebar-border md:block">
        <NavigationContent email={email} />
      </aside>
      <div className="flex items-center justify-between border-b bg-sidebar px-3 py-2 md:hidden">
        <span className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-9" />
          {m.productName}
        </span>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <IconButton
              icon={PanelLeft}
              label={m.nav.menu}
              tooltip={m.nav.menu}
              size="icon"
              variant="ghost"
            />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[90vw] flex-col bg-sidebar shadow-xl"
            >
              <Dialog.Title className="sr-only">{m.nav.menu}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={m.nav.closeMenu}
                  className="absolute right-1 top-1 z-10 flex size-11 items-center justify-center rounded-md hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
              <NavigationContent email={email} onNavigate={() => setOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </>
  );
}

function NavigationContent({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const m = t();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav: { to: '/' | '/operators'; label: string }[] = [
    { to: '/', label: m.nav.tenants },
    { to: '/operators', label: m.nav.operators },
  ];
  return (
    <nav
      aria-label={m.productName}
      className="flex h-full w-full flex-col gap-1 bg-sidebar p-2 text-sidebar-foreground"
    >
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-4 flex items-center gap-2 rounded-md px-1 py-1 text-base font-semibold hover:bg-sidebar-accent active:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <img src="/favicon.svg" alt="" className="size-9" />
        {m.productName}
      </Link>
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          aria-current={
            (item.to === '/' ? pathname !== '/operators' : pathname === item.to)
              ? 'page'
              : undefined
          }
          className="control-nav-item"
        >
          {item.to === '/' ? <Building2 aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          <span>{item.label}</span>
        </Link>
      ))}
      <div className="mt-auto flex flex-col items-stretch gap-2 border-t pt-3 text-sm text-muted-foreground">
        <div className="flex gap-1">
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              lang={locale}
              aria-label={LOCALE_NAMES[locale]}
              aria-pressed={locale === currentLocale()}
              className="h-8 min-w-11 flex-1 rounded-md border bg-background px-2 font-medium hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-emerald-600 aria-pressed:ring-1 aria-pressed:ring-emerald-600/20"
              onClick={() => setLocale(locale)}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
        <div className="truncate px-2">{email}</div>
        <button
          type="button"
          className="control-nav-item"
          onClick={() => {
            void controlApi
              .signOut()
              .then(() => navigate({ to: '/' }))
              .then(() => location.reload());
          }}
        >
          <LogOut aria-hidden="true" />
          {m.nav.signOut}
        </button>
      </div>
    </nav>
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
