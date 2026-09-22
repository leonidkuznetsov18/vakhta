// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OperatorRole, TenantStatus } from '@vakhta/domain';
import type { TenantSummaryView } from '@vakhta/contracts';
import { controlApi, queryKeys } from '@/shared/api';
import { TenantActions } from './actions';

configure({ defaultHidden: true, asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30000 });

const tenant: TenantSummaryView = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Alpha',
  displayName: 'Alpha',
  slug: 'alpha',
  status: TenantStatus.ACTIVE,
  modules: [],
  schemaVersion: null,
  panelHost: null,
  lastJob: null,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:00Z',
};

beforeEach(() => {
  localStorage.setItem('vakhta.control.locale', 'en');
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: tenant.id,
    name: 'Operator',
    email: 'ops@example.test',
    role: OperatorRole.PLATFORM_ADMIN,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(row = tenant) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TenantActions tenant={row} />
    </QueryClientProvider>,
  );
  return client;
}
async function openSuspend() {
  const trigger = await screen.findByRole('button', { name: 'Actions: Alpha' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
  return within(await screen.findByRole('dialog'));
}

it('requires a trimmed reason, preserves a failed draft and allows an explicit retry', async () => {
  const suspend = vi.spyOn(controlApi, 'suspend').mockRejectedValueOnce(new Error('Unavailable'));
  const client = mount();
  const dialog = await openSuspend();
  const submit = dialog.getByRole('button', { name: 'Suspend' });
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(dialog.getByRole('textbox', { name: 'Reason' }), { target: { value: '   ' } });
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(dialog.getByRole('textbox', { name: 'Reason' }), {
    target: { value: '  Contract paused  ' },
  });
  fireEvent.click(submit);
  await dialog.findByRole('alert');
  expect(suspend).toHaveBeenCalledExactlyOnceWith(tenant.id, 'Contract paused');
  expect(dialog.getByRole('textbox', { name: 'Reason' })).toHaveProperty(
    'value',
    '  Contract paused  ',
  );
  expect(submit.hasAttribute('disabled')).toBe(false);
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  client.clear();
});

it('disables repeat suspension and hides mutations from viewers', async () => {
  const client = mount({ ...tenant, status: TenantStatus.SUSPENDED });
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions: Alpha' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    (await screen.findByRole('menuitem', { name: 'Suspend' })).getAttribute('aria-disabled'),
  ).toBe('true');
  client.setQueryData(queryKeys.me, { id: tenant.id, role: OperatorRole.PLATFORM_VIEWER });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Actions: Alpha' })).toBeNull());
  client.clear();
});

it('confirms irreversible deletion with a reason and closes only after success', async () => {
  const remove = vi.spyOn(controlApi, 'deleteTenant').mockResolvedValue({
    id: tenant.id,
    tenantId: tenant.id,
    kind: 'DELETE',
    status: 'PENDING',
    error: null,
    createdAt: tenant.createdAt,
    startedAt: null,
    finishedAt: null,
    steps: [],
  });
  const client = mount({ ...tenant, status: TenantStatus.SUSPENDED });
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions: Alpha' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByText(/permanently destroyed/)).toBeDefined();
  const submit = dialog.getByRole('button', { name: 'Delete' });
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(dialog.getByRole('textbox', { name: 'Reason' }), {
    target: { value: ' Contract ended ' },
  });
  fireEvent.click(submit);
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(tenant.id, 'Contract ended'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  client.clear();
});
