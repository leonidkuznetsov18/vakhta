// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { TenantDetailView, TenantUserKind, type TenantUsersView } from '@vakhta/contracts';
import { WebRole, WEB_ROLES } from '@vakhta/domain';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createControlRouter } from '@/app/router';
import { controlApi } from '@/shared/api';
import * as userView from '../model/view';
import { tenantUsersQueries } from '../api/users';

vi.setConfig({ testTimeout: 15000 });
const time = '2026-09-21T10:00:00.000Z';
const tenant = TenantDetailView.parse({
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'alpha',
  name: 'Alpha',
  displayName: 'Alpha',
  status: 'ACTIVE',
  modules: ['ADMIN_PANEL', 'WORKER_BOT'],
  schemaVersion: '0052_test',
  panelHost: 'alpha.example.test',
  lastJob: null,
  createdAt: time,
  updatedAt: time,
  defaultLocale: 'en',
  timezone: 'Europe/Kyiv',
  storagePrefix: 'tenants/alpha',
  databaseName: 'vakhta_t_alpha',
  migratedAt: time,
  suspendedAt: null,
  suspendedReason: null,
  accentColor: null,
  logoKey: null,
  botUsername: 'alpha_bot',
  moduleRows: [{ module: 'ADMIN_PANEL', enabled: true, config: {} }],
  domains: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      host: 'alpha.example.test',
      surface: 'PANEL',
      isPrimary: true,
      isManaged: true,
      status: 'VERIFIED',
      verifiedAt: time,
    },
  ],
  secrets: [
    { kind: 'DATABASE_URL', present: true, updatedAt: time },
    { kind: 'BOT_TOKEN', present: true, updatedAt: time },
  ],
  onboarding: null,
});

const view: TenantUsersView = {
  counts: {
    total: 1011,
    workers: 1000,
    panel: 11,
    checkedAt: time,
    roles: WEB_ROLES.map((role) => ({ role, count: role === WebRole.HR ? 2 : 0 })),
  },
  items: [
    {
      id: '00000000-0000-4000-8000-000000000020',
      kind: TenantUserKind.PANEL,
      name: 'Olena HR',
      email: 'olena@example.test',
      roles: [WebRole.HR],
      image: null,
      avatarId: null,
      personnelNumber: null,
    },
  ],
  total: 1011,
};
let client: QueryClient;
let requests: URL[];
let failure: boolean;
let pending: Map<
  string,
  { resolve: (value: Response) => void; signal: AbortSignal | null | undefined }
>;
let delayRequests: boolean;
beforeEach(() => {
  localStorage.setItem('vakhta.control.locale', 'en');
  vi.stubGlobal('scrollTo', vi.fn());
  requests = [];
  failure = false;
  delayRequests = false;
  pending = new Map();
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    name: 'Operator',
    email: 'operator@example.test',
    role: 'PLATFORM_ADMIN',
  });
  vi.spyOn(controlApi, 'tenant').mockResolvedValue(tenant);
  vi.spyOn(controlApi, 'jobs').mockResolvedValue([]);
  vi.spyOn(controlApi, 'tenants').mockResolvedValue([tenant]);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      requests.push(url);
      if (failure) return new Response(JSON.stringify({ message: 'Unavailable' }), { status: 503 });
      if (url.pathname.endsWith('/counts'))
        return Response.json([{ tenantId: tenant.id, status: 'READY', counts: view.counts }]);
      if (delayRequests) {
        return new Promise<Response>((resolve) => {
          pending.set(url.search, { resolve, signal: init?.signal });
        });
      }
      const filtered = url.searchParams.get('role') === WebRole.HR;
      const empty = url.searchParams.get('search') === 'missing';
      return Response.json({
        ...view,
        total: filtered ? 2 : view.total,
        ...(empty ? { total: 0, items: [] } : {}),
      });
    }),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(hash = `#/tenants/${tenant.id}?tab=users`) {
  window.location.hash = hash;
  const router = createControlRouter();
  await router.load();
  const rendered = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { router, ...rendered };
}
it('shows a client total linking to the tenant users tab', async () => {
  await setup('#/');
  await screen.findByRole('link', { name: 'Users: 1011' });
  expect(screen.getByRole('link', { name: 'Users: 1011' }).getAttribute('href')).toContain(
    'tab=users',
  );
});
it('shows role counts, current identities and URL-backed filtering/search', async () => {
  await setup();
  await screen.findByText('olena@example.test');
  expect(screen.getByText('1011', { selector: 'strong' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'HR 2' }));
  await screen.findByText('Showing 1 of 2');
  expect(window.location.hash).toContain('usersRole=HR');
  expect(requests.some((url) => url.searchParams.get('role') === WebRole.HR)).toBe(true);
  const search = screen.getByRole('searchbox', { name: 'Search name, email or personnel number' });
  expect(screen.getByRole('button', { name: 'Search' })).toHaveProperty('disabled', true);
  fireEvent.change(search, { target: { value: 'missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByText('No users match these filters.');
  expect(screen.getByText('Showing 0 of 0')).toBeTruthy();
});
it('does not invent zero after failure and retries successfully', async () => {
  failure = true;
  await setup();
  await screen.findByRole('alert');
  expect(screen.queryByText('Showing 0 of 0')).toBeNull();
  failure = false;
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
  await screen.findByText('olena@example.test');
});
it('retains cached users after refresh failure and distinguishes offline state', async () => {
  await setup();
  await screen.findByText('olena@example.test');
  failure = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('alert');
  expect(screen.getByText('olena@example.test')).toBeTruthy();
  failure = false;
  await act(async () => {
    onlineManager.setOnline(false);
    await client.invalidateQueries({ queryKey: ['tenant', tenant.id] });
  });
  // The query factory uses the tenant detail prefix; pause is asserted through an explicit refetch.
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(screen.getByText('You are offline. Reconnect to refresh users.')).toBeTruthy(),
  );
});

it('shows the zero filtered client count without claiming the tenant registry is empty', async () => {
  await setup('#/');
  await screen.findByRole('link', { name: 'Users: 1011' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name or slug' }), {
    target: { value: 'unmatched' },
  });
  expect(screen.getByText('Showing 0 of 0')).toBeTruthy();
  expect(screen.queryByText('No clients yet. Create the first one.')).toBeNull();
});

function pendingRequest(role: string, page = 1) {
  const key = `?${new URLSearchParams({ page: String(page), role, search: '' })}`;
  const request = pending.get(key);
  if (!request) throw new Error(`No pending request for ${key}`);
  return request;
}

it('keeps filter controls and rows mounted while loading and reuses fresh filters', async () => {
  await setup();
  const identity = await screen.findByText('olena@example.test');
  const group = screen.getByRole('group', { name: 'Roles' });
  const search = screen.getByRole('searchbox');
  delayRequests = true;
  fireEvent.click(screen.getByRole('button', { name: 'HR 2' }));
  await screen.findByText('Refreshing users…');
  expect(screen.getByRole('group', { name: 'Roles' })).toBe(group);
  expect(screen.getByRole('searchbox')).toBe(search);
  expect(screen.getByText('olena@example.test')).toBe(identity);
  expect(identity.closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  await waitFor(() => expect(pending.size).toBe(1));
  await act(async () => pendingRequest(WebRole.HR).resolve(Response.json({ ...view, total: 2 })));
  await screen.findByText('Showing 1 of 2');
  const requestCount = requests.length;
  fireEvent.click(screen.getByRole('button', { name: 'All users 1011' }));
  await screen.findByText('Showing 1 of 1011');
  expect(screen.queryByText('Refreshing users…')).toBeNull();
  expect(requests).toHaveLength(requestCount);
});

it('keeps search typing local without fetching or recomputing directory rows', async () => {
  await setup();
  const identity = await screen.findByText('olena@example.test');
  const presentation = vi.spyOn(userView, 'userPresentation');
  const requestCount = requests.length;
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: 'O' } });
  fireEvent.change(search, { target: { value: 'Olena' } });
  expect(requests).toHaveLength(requestCount);
  expect(presentation).not.toHaveBeenCalled();
  expect(screen.getByText('olena@example.test')).toBe(identity);
  fireEvent.change(search, { target: { value: ' ' } });
  expect(screen.getByRole('button', { name: 'Search' })).toHaveProperty('disabled', true);
});

it('cancels superseded requests and ignores late results after rapid role changes', async () => {
  await setup();
  await screen.findByText('olena@example.test');
  delayRequests = true;
  fireEvent.click(screen.getByRole('button', { name: 'HR 2' }));
  await waitFor(() => expect(pending.size).toBe(1));
  const older = pendingRequest(WebRole.HR);
  fireEvent.click(screen.getByRole('button', { name: 'Administrator 0' }));
  await waitFor(() => expect(pending.size).toBe(2));
  expect(older.signal?.aborted).toBe(true);
  await act(async () =>
    pendingRequest(WebRole.ADMIN).resolve(Response.json({ ...view, total: 3 })),
  );
  await screen.findByText('Showing 1 of 3');
  await act(async () => older.resolve(Response.json({ ...view, total: 2 })));
  expect(screen.getByText('Showing 1 of 3')).toBeTruthy();
  expect(window.location.hash).toContain('usersRole=ADMIN');
});

it('keeps the displayed page number with its rows until the next page arrives', async () => {
  await setup();
  await screen.findByText('olena@example.test');
  delayRequests = true;
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(pending.size).toBe(1));
  expect(screen.getByText('Page 1')).toBeTruthy();
  await act(async () => pendingRequest('ALL', 2).resolve(Response.json(view)));
  await screen.findByText('Page 2');
});

it('cancels pending work and releases query observers when leaving the page', async () => {
  const { unmount } = await setup();
  await screen.findByText('olena@example.test');
  delayRequests = true;
  fireEvent.click(screen.getByRole('button', { name: 'HR 2' }));
  await waitFor(() => expect(pending.size).toBe(1));
  const request = pendingRequest(WebRole.HR);
  unmount();
  expect(request.signal?.aborted).toBe(true);
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => query.getObserversCount() === 0),
  ).toBe(true);
  await act(async () => request.resolve(Response.json(view)));
  expect(
    client.getQueryData(
      tenantUsersQueries.directory(tenant.id, { page: 1, role: WebRole.HR, search: '' }).queryKey,
    ),
  ).toBeUndefined();
});

it('does not retain directory data when navigating to another tenant', async () => {
  const { router } = await setup();
  await screen.findByText('olena@example.test');
  delayRequests = true;
  await act(async () =>
    router.navigate({
      to: '/tenants/$id',
      params: { id: '00000000-0000-4000-8000-000000000099' },
      search: { tab: 'users' },
    }),
  );
  await waitFor(() => expect(pending.size).toBe(1));
  expect(screen.queryByText('olena@example.test')).toBeNull();
  expect(screen.queryByRole('group', { name: 'Roles' })).toBeNull();
  await act(async () =>
    pendingRequest('ALL').resolve(Response.json({ ...view, items: [], total: 0 })),
  );
  await screen.findByText('Showing 0 of 0');
});
