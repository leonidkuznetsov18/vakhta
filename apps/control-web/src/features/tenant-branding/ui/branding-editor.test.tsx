// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { controlApi, queryKeys } from '@/shared/api';
import { BrandingEditor } from './branding-editor';

const view = {
  displayName: 'Alpha',
  accentColor: null,
  logoUrl: null,
  updatedAt: '2026-09-21T10:00:00.000Z',
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(queryKeys.me, { id: 'operator', role: 'PLATFORM_ADMIN' });
  render(
    <QueryClientProvider client={client}>
      <BrandingEditor tenantId="alpha" />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  localStorage.setItem('vakhta.control.locale', 'en');
  vi.spyOn(controlApi, 'me').mockResolvedValue({
    id: 'operator',
    role: 'PLATFORM_ADMIN',
    name: 'Operator',
    email: 'operator@example.test',
  });
  vi.spyOn(controlApi, 'branding').mockResolvedValue(view);
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('branding editor recovery', () => {
  it('keeps unsaved input mounted after a failed background refresh', async () => {
    const client = setup();
    const name = await screen.findByRole('textbox', { name: 'Display name' });
    fireEvent.change(name, { target: { value: 'Unsaved name' } });
    vi.mocked(controlApi.branding).mockRejectedValue(new Error('Network unavailable'));
    await client.invalidateQueries({ queryKey: queryKeys.branding('alpha') });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveProperty(
        'value',
        'Unsaved name',
      ),
    );
    expect(screen.getByRole('button', { name: 'Save branding' })).toHaveProperty('disabled', false);
  });
  it('reads a local logo offline and enables discard instead of getting stuck pending', async () => {
    setup();
    await screen.findByRole('textbox', { name: 'Display name' });
    onlineManager.setOnline(false);
    fireEvent.change(screen.getByLabelText('Logo', { exact: true }), {
      target: { files: [new File(['test-image'], 'logo.png', { type: 'image/png' })] },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove logo' })).toHaveProperty('disabled', false),
    );
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveProperty(
      'disabled',
      false,
    );
  });
  it('disables reverted edits and retains input after a failed save', async () => {
    const save = vi
      .spyOn(controlApi, 'updateBranding')
      .mockRejectedValue(new Error('Network unavailable'));
    setup();
    const name = await screen.findByRole('textbox', { name: 'Display name' });
    const button = screen.getByRole('button', { name: 'Save branding' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.change(name, { target: { value: 'Beta' } });
    fireEvent.change(name, { target: { value: 'Alpha' } });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(name, { target: { value: 'Changed Alpha' } });
    fireEvent.click(button);
    await screen.findByText('Could not save branding. Your changes remain in the form.');
    expect(name).toHaveProperty('value', 'Changed Alpha');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
