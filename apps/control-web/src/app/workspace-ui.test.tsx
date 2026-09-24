// @vitest-environment jsdom
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  configure,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StepStatus, TenantSecretKind } from '@vakhta/domain';
import { TenantDetailView, type ProvisioningJobView } from '@vakhta/contracts';
import { createControlRouter } from '@/app/router';
import { controlApi } from '@/shared/api';
import { TooltipProvider } from '@/components/ui/tooltip';

// Match the panel suite: jsdom visibility scans around Radix portals are expensive.
// Dialog assertions stay scoped with within(), and focus is checked on the real elements.
configure({ asyncUtilTimeout: 5_000, defaultHidden: true });
vi.setConfig({ testTimeout: 15_000 });

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
const job: ProvisioningJobView = {
  id: '00000000-0000-4000-8000-000000000003',
  tenantId: tenant.id,
  kind: 'PROVISION',
  status: 'PENDING',
  error: null,
  createdAt: time,
  startedAt: time,
  finishedAt: null,
  steps: [
    {
      step: 'CREATE_DATABASE',
      seq: 1,
      status: 'DONE',
      attempts: 1,
      lastError: null,
      output: null,
      startedAt: time,
      finishedAt: time,
    },
    {
      step: 'REGISTER_DOMAINS',
      seq: 2,
      status: 'MANUAL_REQUIRED',
      attempts: 1,
      lastError: null,
      output: {
        instruction: 'CREATE_DNS_RECORDS',
        records: [{ type: 'CNAME', host: 'alpha.example.test', target: 'panel.example.test' }],
      },
      startedAt: time,
      finishedAt: null,
    },
    {
      step: 'BOT_WEBHOOK',
      seq: 3,
      status: 'SKIPPED',
      attempts: 0,
      lastError: null,
      output: null,
      startedAt: null,
      finishedAt: time,
    },
  ],
};
let client: QueryClient;
beforeEach(() => {
  localStorage.setItem('vakhta.control.locale', 'en');
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  vi.stubEnv('VITE_APP_VERSION', '1.2.3');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    name: 'Operator',
    email: 'qa@example.test',
    role: 'PLATFORM_ADMIN',
  });
  vi.spyOn(controlApi, 'tenant').mockResolvedValue(tenant);
  vi.spyOn(controlApi, 'tenants').mockResolvedValue([tenant]);
  vi.spyOn(controlApi, 'jobs').mockResolvedValue([job]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function open(tab?: string) {
  window.history.replaceState(null, '', tab ? `/#/tenants/${tenant.id}?tab=${tab}` : '/#/');
  const router = createControlRouter();
  await act(async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light" storageKey="control-test-theme">
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    await router.load();
  });
  return router;
}

it('opens a client by row click and retains a real keyboard link without an Open button', async () => {
  await open();
  const link = await screen.findByRole('link', { name: 'Alpha' });
  expect(link.getAttribute('href')).toContain(tenant.id);
  expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
  fireEvent.click(screen.getByText('alpha.example.test'));
  await screen.findByRole('heading', { name: 'Alpha' });
  expect(
    screen
      .getByRole('navigation', { name: 'Vakhta Control' })
      .querySelector('[aria-current="page"]')?.textContent,
  ).toBe('Clients');
  const external = screen.getByRole('link', { name: 'Open client panel' });
  expect(external.querySelector('svg')).not.toBeNull();
  expect(external.parentElement?.lastElementChild?.getAttribute('aria-label')).toBe('Active');
});

it('shows only delivered modules as named checkboxes and sends the changed state once', async () => {
  const save = vi.spyOn(controlApi, 'setModule').mockResolvedValue(tenant);
  await open('modules');
  const checkbox = await screen.findByRole('checkbox', { name: 'Admin panel' });
  expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  expect(screen.getByRole('checkbox', { name: 'Equipment maintenance' })).toBeTruthy();
  expect(checkbox.getAttribute('data-state')).toBe('checked');
  expect(screen.queryByText('Support bot')).toBeNull();
  expect(screen.queryByText('Photo inspection')).toBeNull();
  expect(screen.queryByText('enabled', { exact: true })).toBeNull();
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(save).toHaveBeenCalledExactlyOnceWith(tenant.id, 'ADMIN_PANEL', { enabled: false }),
  );
});

it('marks only the saving module checkbox busy and shows the saved state without a fallback', async () => {
  let finish: (detail: TenantDetailView) => void = () => {};
  vi.spyOn(controlApi, 'setModule').mockReturnValue(
    new Promise<TenantDetailView>((resolve) => {
      finish = resolve;
    }),
  );
  await open('modules');
  const admin = await screen.findByRole('checkbox', { name: 'Admin panel' });
  const kiosk = screen.getByRole('checkbox', { name: 'QR kiosk' });
  admin.focus();
  fireEvent.click(admin);
  await waitFor(() => expect(admin.getAttribute('aria-busy')).toBe('true'));
  expect(admin.getAttribute('data-state')).toBe('unchecked');
  expect(admin.parentElement?.querySelector('[data-slot=spinner]')).not.toBeNull();
  expect(kiosk.getAttribute('aria-busy')).toBe('false');
  expect(kiosk.hasAttribute('disabled')).toBe(false);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  const saved = TenantDetailView.parse({
    ...tenant,
    moduleRows: [{ module: 'ADMIN_PANEL', enabled: false, config: {} }],
  });
  vi.mocked(controlApi.tenant).mockResolvedValue(saved);
  const tenantReads = vi.mocked(controlApi.tenant).mock.calls.length;
  await act(async () => {
    finish(saved);
  });
  await waitFor(() => expect(admin.getAttribute('aria-busy')).toBe('false'));
  expect(admin.getAttribute('data-state')).toBe('unchecked');
  expect(screen.queryByRole('status')).toBeNull();
  await waitFor(() =>
    expect(vi.mocked(controlApi.tenant).mock.calls.length).toBeGreaterThan(tenantReads),
  );
  expect(admin.getAttribute('data-state')).toBe('unchecked');
  expect(document.activeElement).toBe(admin);
});

it('shows domain technical details as a disclosure without domain creation', async () => {
  await open('domains');
  const host = await screen.findByText('alpha.example.test');
  const disclosure = host.closest('details');
  expect(disclosure).not.toBeNull();
  expect(disclosure?.querySelector('summary')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Add domain' })).toBeNull();
  expect(screen.getByText('Domain verified')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open domain' }).getAttribute('href')).toBe(
    'https://alpha.example.test',
  );
  expect(screen.getByText('Domains: 1')).toBeTruthy();
});

it('keeps skipped work distinct from completed work and routes unfinished steps to configuration', async () => {
  await open('jobs');
  await screen.findByText('Skipped: 1');
  const skipped = screen.getByText('Connect bot').closest('li');
  if (!skipped) throw new Error('Missing webhook task');
  expect(within(skipped).getByText('skipped')).toBeTruthy();
  expect(
    within(skipped)
      .getByRole('link', { name: 'Open configuration', hidden: true })
      .getAttribute('href'),
  ).toContain('tab=bot');
  const completed = screen.getByText('Create database').closest('li');
  if (!completed) throw new Error('Missing database task');
  expect(
    within(completed).queryByRole('link', { name: 'Open configuration', hidden: true }),
  ).toBeNull();
});

it('does not confuse a saved bot token with the webhook secret', async () => {
  await open('bot');
  await screen.findByText('Webhook secret: missing');
  expect(screen.getByRole('button', { name: 'How to get a bot token' })).toBeTruthy();
});

it('shows operator identity, appearance controls and release version in the panel footer', async () => {
  await open();
  await screen.findByRole('link', { name: 'Alpha' });
  const nav = screen.getByRole('navigation', { name: 'Vakhta Control' });
  const footer = within(nav);
  expect(footer.getByRole('img', { name: 'Operator' }).textContent).toBe('OP');
  expect(footer.getByText('Platform administrator')).toBeTruthy();
  expect(footer.getByText('Version 1.2.3')).toBeTruthy();
  fireEvent.click(footer.getByRole('button', { name: 'Dark' }));
  await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  expect(localStorage.getItem('control-test-theme')).toBe('dark');
  fireEvent.click(footer.getByRole('button', { name: 'Profile' }));
  const profile = await screen.findByRole('dialog', { name: 'Profile' });
  expect(within(profile).getByText('qa@example.test')).toBeTruthy();
});

it('collapses the desktop sidebar while preserving accessible navigation', async () => {
  await open();
  await screen.findByRole('link', { name: 'Alpha' });
  fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')).toBe(
    'collapsed',
  );
  expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')).toBe(
    'expanded',
  );
});

it('keeps mobile profile details open and returns to the drawer on close', async () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  await open();
  await screen.findByRole('link', { name: 'Alpha' });
  fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
  const drawer = await screen.findByRole('dialog', { name: 'Sections' });
  fireEvent.click(within(drawer).getByRole('button', { name: 'Profile' }));
  const profile = await screen.findByRole('dialog', { name: 'Profile' });
  expect(within(profile).getByText('qa@example.test')).toBeTruthy();
  fireEvent.click(within(profile).getByRole('button', { name: 'Close' }));
  expect(await screen.findByRole('dialog', { name: 'Sections' })).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(within(drawer).getByRole('button', { name: 'Profile' })),
  );
  fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sections' })).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sections' })),
  );
});

it('keeps missing bot setup actionable after core provisioning and replaces it with the connection job after saving', async () => {
  const missingToken = {
    ...tenant,
    botUsername: null,
    secrets: tenant.secrets.filter((secret) => secret.kind !== TenantSecretKind.BOT_TOKEN),
  };
  const completed = {
    ...job,
    status: 'DONE' as const,
    finishedAt: time,
    steps: job.steps.filter((step) => step.status === StepStatus.DONE),
  };
  vi.mocked(controlApi.tenant).mockResolvedValue(missingToken);
  vi.mocked(controlApi.jobs).mockResolvedValue([completed]);
  const save = vi.spyOn(controlApi, 'setBotToken').mockImplementation(async () => {
    vi.mocked(controlApi.tenant).mockResolvedValue(tenant);
    vi.mocked(controlApi.jobs).mockResolvedValue([
      {
        ...job,
        kind: 'ROTATE_BOT_TOKEN',
        status: 'FAILED',
        steps: [
          {
            step: 'BOT_WEBHOOK',
            seq: 0,
            status: 'FAILED',
            attempts: 1,
            lastError: 'Connection failed',
            output: null,
            startedAt: time,
            finishedAt: time,
          },
        ],
      },
      { ...completed, id: 'completed-core' },
    ]);
    return tenant;
  });
  const router = await open('jobs');
  const task = (await screen.findByText('Add bot token')).closest('li');
  if (!(task instanceof HTMLElement)) throw new Error('Missing bot setup task');
  expect(within(task).getByText('action needed')).toBeTruthy();
  expect(screen.getByText('1 of 2 done')).toBeTruthy();
  expect(screen.getAllByRole('list', { name: 'Jobs' })).toHaveLength(1);
  expect(screen.queryByRole('alert')).toBeNull();
  const disclosure = task.querySelector('details');
  const trigger = task.querySelector('summary');
  if (!disclosure || !trigger) throw new Error('Missing expandable task');
  expect(disclosure.open).toBe(false);
  expect(trigger.className).toContain('text-muted-foreground');
  fireEvent.click(trigger);
  expect(disclosure.open).toBe(true);
  fireEvent.click(within(task).getByRole('link', { name: 'Open configuration', hidden: true }));
  const input = await screen.findByLabelText('Save token');
  fireEvent.change(input, { target: { value: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(input).toHaveProperty('value', ''));
  await act(async () => {
    await router.navigate({
      to: '/tenants/$id',
      params: { id: tenant.id },
      search: { tab: 'jobs' },
    });
  });
  await screen.findByText('Connect bot');
  expect(screen.getAllByRole('list', { name: 'Jobs' })).toHaveLength(1);
  expect(screen.getByText('1 of 2 done')).toBeTruthy();
  expect(screen.queryByText('Add bot token')).toBeNull();
  expect(screen.getByText('Connection failed')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry', hidden: true })).toBeTruthy();
});

it.each([
  { enabled: false, token: false, required: false },
  { enabled: true, token: true, required: false },
  { enabled: true, token: false, required: true },
])(
  'derives bot setup from current configuration even without historical jobs (%j)',
  async ({ enabled, token, required }) => {
    vi.mocked(controlApi.tenant).mockResolvedValue({
      ...tenant,
      modules: enabled ? ['ADMIN_PANEL', 'WORKER_BOT'] : ['ADMIN_PANEL'],
      secrets: [{ kind: 'BOT_TOKEN', present: token, updatedAt: time }],
    });
    vi.mocked(controlApi.jobs).mockResolvedValue([]);
    await open('jobs');
    await screen.findByRole('heading', { name: 'Alpha' });
    await waitFor(() => expect(Boolean(screen.queryByText('Add bot token'))).toBe(required));
  },
);

it('keeps one latest result per task and retries the job that owns the current result', async () => {
  const newerId = '00000000-0000-4000-8000-000000000004';
  const connection: ProvisioningJobView = {
    ...job,
    id: newerId,
    kind: 'ROTATE_BOT_TOKEN',
    status: 'FAILED',
    createdAt: '2026-09-22T10:00:00.000Z',
    steps: [
      {
        step: 'BOT_WEBHOOK',
        seq: 0,
        status: 'FAILED',
        attempts: 1,
        lastError: 'Connection failed',
        output: null,
        startedAt: time,
        finishedAt: time,
      },
    ],
  };
  vi.mocked(controlApi.jobs).mockResolvedValue([connection, job]);
  const retry = vi.spyOn(controlApi, 'retryStep').mockResolvedValue(connection);
  await open('jobs');
  const list = await screen.findByRole('list', { name: 'Jobs' });
  expect(screen.getAllByRole('list', { name: 'Jobs' })).toHaveLength(1);
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  const item = within(list).getByText('Connect bot').closest('li');
  if (!item) throw new Error('Missing bot step');
  expect(within(item).queryByText('skipped')).toBeNull();
  expect(within(item).getByText('Connection failed')).toBeTruthy();
  fireEvent.click(within(item).getByRole('button', { name: 'Retry', hidden: true }));
  await waitFor(() => expect(retry).toHaveBeenCalledExactlyOnceWith(newerId, 'BOT_WEBHOOK'));
});

it('shows one checklist after repeated provisioning and preserves a completed invitation across a later no-op', async () => {
  const first: ProvisioningJobView = {
    ...job,
    status: 'DONE',
    steps: [
      {
        step: 'INVITE_ADMIN',
        seq: 0,
        status: 'DONE',
        attempts: 1,
        lastError: null,
        output: null,
        startedAt: time,
        finishedAt: time,
      },
    ],
  };
  const repeat: ProvisioningJobView = {
    ...first,
    id: '00000000-0000-4000-8000-000000000005',
    createdAt: '2026-09-22T10:00:00.000Z',
    steps: first.steps.map((step) => ({ ...step, status: 'SKIPPED' })),
  };
  vi.mocked(controlApi.jobs).mockResolvedValue([repeat, first]);
  await open('jobs');
  const list = await screen.findByRole('list', { name: 'Jobs' });
  expect(screen.getAllByRole('list', { name: 'Jobs' })).toHaveLength(1);
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Invite administrator')).toBeTruthy();
  expect(within(list).getByText('done')).toBeTruthy();
  expect(screen.getByText('1 of 1 done')).toBeTruthy();
  expect(screen.queryByText(/Provision client/)).toBeNull();
});
