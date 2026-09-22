// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
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
import { RouterProvider } from '@tanstack/react-router';
import { OperatorRole, OperatorStatus } from '@vakhta/domain';
import { createControlRouter } from './router';
import { controlApi } from '@/shared/api';

configure({ defaultHidden: true, asyncUtilTimeout: 5000 });
const id = '00000000-0000-4000-8000-000000000002';
const token = 'a'.repeat(64);
const expiresAt = '2026-10-01T10:00:00.000Z';
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(options: { path?: string; role?: OperatorRole; pending?: boolean } = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('vakhta.control.locale', 'en');
  window.history.replaceState(null, '', options.path ?? '/#/operators');
  const me = vi.spyOn(controlApi, 'me').mockResolvedValue({
    id,
    name: 'Admin',
    email: 'admin@example.test',
    role: options.role ?? OperatorRole.PLATFORM_ADMIN,
  });
  vi.spyOn(controlApi, 'operators').mockResolvedValue([
    {
      id,
      name: 'Olena',
      email: 'olena@example.test',
      role: OperatorRole.PLATFORM_VIEWER,
      status: OperatorStatus.ACTIVE,
      twoFactorEnabled: false,
      invitationPending: options.pending ?? true,
    },
  ]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createControlRouter();
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { me, router };
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function field(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}

it('creates an invitation, invalidates the list and copies the public hash link', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ operatorId: id, token, expiresAt }));
  vi.stubGlobal('fetch', fetch);
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Add operator' }));
  const submit = screen.getByRole('button', { name: 'Create link' });
  expect(submit).toHaveProperty('disabled', true);
  field('Name', 'New Operator');
  field('E-mail', 'NEW@example.test');
  fireEvent.click(submit);
  const input = await screen.findByLabelText('Invitation link');
  expect(input).toHaveProperty('value', `${window.location.origin}/#/invite?token=${token}`);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify({
      email: 'new@example.test',
      name: 'New Operator',
      role: OperatorRole.PLATFORM_VIEWER,
    }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/#/invite?token=${token}`),
  );
  expect(controlApi.operators).toHaveBeenCalledTimes(2);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() =>
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(token),
  );
  expect(JSON.stringify(localStorage)).not.toContain(token);
});

it('preserves a failed creation draft without automatically retrying', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ code: 'OPERATOR_EXISTS' }, 409));
  vi.stubGlobal('fetch', fetch);
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Add operator' }));
  field('Name', 'New Operator');
  field('E-mail', 'duplicate@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
  await screen.findByText(/An operator with this email already exists/);
  expect(screen.getByLabelText('E-mail')).toHaveProperty('value', 'duplicate@example.test');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('hides invitations from viewers and activated operators', async () => {
  await setup({ role: OperatorRole.PLATFORM_VIEWER, pending: false });
  await screen.findByText('olena@example.test');
  expect(screen.queryByRole('button', { name: 'Add operator' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'New invitation' })).toBeNull();
  expect(screen.getByText('Total operators: 1')).toBeTruthy();
});

it('reissues only after the operator explicitly confirms replacement', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ operatorId: id, token, expiresAt }));
  vi.stubGlobal('fetch', fetch);
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: 'New invitation' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/previous link will stop working/)).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create link' }));
  await screen.findByLabelText('Invitation link');
  expect(fetch.mock.calls[0]?.[0]).toContain(`/control/operators/${id}/invitations`);
});

it('opens publicly, rejects mismatched passwords, preserves failure and removes the token on success', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ name: 'Olena', email: 'olena@example.test', expiresAt }))
    .mockResolvedValueOnce(response({ code: 'FAILURE' }, 503))
    .mockResolvedValueOnce(response({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const { me, router } = await setup({ path: `/#/invite?token=${token}` });
  await screen.findByText('olena@example.test');
  expect(me).not.toHaveBeenCalled();
  field('Password', 'operator-test-password');
  field('Confirm password', 'different-password');
  fireEvent.blur(screen.getByLabelText('Confirm password'));
  await screen.findByText('Passwords do not match.');
  expect(screen.getByRole('button', { name: 'Set password' })).toHaveProperty('disabled', true);
  field('Confirm password', 'operator-test-password');
  fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Password')).toHaveProperty('value', 'operator-test-password');
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
  await screen.findByText('Password set');
  expect(router.state.location.href).not.toContain(token);
  expect(screen.queryByLabelText('Password')).toBeNull();
});

it('shows an unavailable invitation instead of a password form', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ code: 'INVITATION_UNAVAILABLE' }, 404)),
  );
  await setup({ path: `/#/invite?token=${token}` });
  await screen.findByText(/This invitation is invalid/);
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  expect(screen.queryByLabelText('Password')).toBeNull();
});
