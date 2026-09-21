// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createControlRouter } from '@/app/router';
import { controlApi, queryKeys } from '@/shared/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('preserves a branding draft when both parent workspace and operator refresh fail', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('vakhta.control.locale', 'en');
  window.history.replaceState(null, '', '/#/tenants/alpha?tab=branding');
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    role: 'PLATFORM_ADMIN',
    name: 'Operator',
    email: 'operator@example.test',
  });
  vi.spyOn(controlApi, 'branding').mockResolvedValue({
    displayName: 'Alpha',
    accentColor: null,
    logoUrl: null,
    updatedAt: '2026-09-21T10:00:00.000Z',
  });
  vi.spyOn(controlApi, 'jobs').mockResolvedValue([]);
  vi.spyOn(controlApi, 'tenant').mockResolvedValue({
    id: 'alpha',
    slug: 'alpha',
    name: 'Alpha',
    displayName: 'Alpha',
    status: 'ACTIVE',
    modules: [],
    schemaVersion: null,
    panelHost: null,
    lastJob: null,
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
    defaultLocale: 'en',
    timezone: 'Europe/Kyiv',
    storagePrefix: '',
    databaseName: 'alpha',
    migratedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    accentColor: null,
    logoKey: null,
    botUsername: null,
    moduleRows: [],
    domains: [],
    secrets: [],
    onboarding: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createControlRouter();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const input = await screen.findByRole('textbox', { name: 'Display name' });
  fireEvent.change(input, { target: { value: 'Unsaved Alpha' } });
  vi.mocked(controlApi.me).mockRejectedValue(new TypeError('Offline'));
  vi.mocked(controlApi.tenant).mockRejectedValue(new TypeError('Offline'));
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.me }),
    client.invalidateQueries({ queryKey: queryKeys.tenant('alpha'), exact: true }),
  ]);
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveProperty(
      'value',
      'Unsaved Alpha',
    ),
  );
  expect(screen.getByRole('button', { name: 'Save branding' })).toHaveProperty('disabled', false);
  expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
});
