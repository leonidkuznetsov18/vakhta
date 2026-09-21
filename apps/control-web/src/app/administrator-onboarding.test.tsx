// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createControlRouter } from '@/app/router';
import { OperatorRole } from '@vakhta/domain';
import { controlApi } from '@/shared/api';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  { usedAt: null, invitation: true, role: OperatorRole.PLATFORM_ADMIN, visible: true },
  {
    usedAt: '2026-09-21T10:00:00.000Z',
    invitation: true,
    role: OperatorRole.PLATFORM_ADMIN,
    visible: false,
  },
  { usedAt: null, invitation: false, role: OperatorRole.PLATFORM_ADMIN, visible: true },
  { usedAt: null, invitation: false, role: OperatorRole.PLATFORM_VIEWER, visible: false },
])('shows setup only when actionable (%j)', async ({ usedAt, invitation, role, visible }) => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('vakhta.control.locale', 'en');
  window.history.replaceState(null, '', '/#/tenants/alpha?tab=overview');
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    role,
    name: 'Operator',
    email: 'operator@example.test',
  });
  vi.spyOn(controlApi, 'jobs').mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, databaseReady: true })),
      ),
  );
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
    onboarding: invitation
      ? {
          url: 'https://example.test/setup',
          usedAt,
          expiresAt: '2026-09-28T10:00:00.000Z',
        }
      : null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createControlRouter()} />
    </QueryClientProvider>,
  );
  await screen.findByText('Tenant administrators');
  expect(Boolean(screen.queryByText('Set up administrator access'))).toBe(visible);
  vi.unstubAllGlobals();
});
