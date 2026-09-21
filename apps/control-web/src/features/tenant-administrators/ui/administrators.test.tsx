// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { controlApi } from '@/shared/api';
import { administratorApi } from '../api/administrators';
import { TenantAdministrators } from './administrators';

const admin = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Olena',
  email: 'olena@example.test',
  twoFactorEnabled: true,
  createdAt: '2026-09-21T10:00:00.000Z',
  canDelete: false,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(options: { role?: 'PLATFORM_ADMIN' | 'PLATFORM_VIEWER'; error?: Error } = {}) {
  const role = options.role ?? 'PLATFORM_ADMIN';
  localStorage.setItem('vakhta.control.locale', 'en');
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    email: 'operator@example.test',
    name: 'Operator',
    role,
  });
  const list = vi.spyOn(administratorApi, 'list').mockResolvedValue({
    items: [admin],
    total: 1,
    databaseReady: true,
  });
  if (options.error) list.mockRejectedValue(options.error);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TenantAdministrators tenantId="alpha" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return client;
}
it('shows all returned administrators and protects the last administrator', async () => {
  setup();
  expect(await screen.findByText(admin.email)).toBeTruthy();
  expect(screen.getByText('Administrators: 1')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete administrator' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByText('MFA enabled')).toBeTruthy();
});
it('keeps viewer access read-only', async () => {
  setup({ role: 'PLATFORM_VIEWER' });
  await screen.findByText(admin.email);
  expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete administrator' })).toBeNull();
});
it('preserves an unsaved password after failure, resets explicitly and clears it on close', async () => {
  const save = vi
    .spyOn(administratorApi, 'password')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ ok: true });
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
  const input = screen.getByLabelText('New password');
  expect(screen.getByRole('button', { name: 'Save password' })).toHaveProperty('disabled', true);
  fireEvent.change(input, { target: { value: 'new-password-for-tests' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  await screen.findByRole('alert');
  expect(input).toHaveProperty('value', 'new-password-for-tests');
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  expect(input).toHaveProperty('type', 'text');
  expect(input).not.toHaveProperty('value', 'new-password-for-tests');
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  await screen.findByText('Password saved. Keep the new password before closing this window.');
  expect(screen.queryByRole('button', { name: 'Save password' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByLabelText('New password')).toHaveProperty('value', '');
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('new-password-for-tests');
});
it('shows a retry for failed initial loading, never an invented empty state', async () => {
  setup({ error: new Error('Failed') });
  await screen.findByRole('alert');
  expect(screen.queryByText('No administrators found.')).toBeNull();
  expect(screen.queryByText('Administrators: 0')).toBeNull();
  vi.mocked(administratorApi.list).mockResolvedValue({
    items: [admin],
    total: 1,
    databaseReady: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(admin.email)).toBeTruthy();
});
