import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/shared/config';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WelcomePage } from './welcome-page';

const t = messages(currentLocale()).onboarding;
const ready = {
  status: 'READY',
  email: 'admin@alpha.test',
  displayName: 'Alpha factory',
  botUrl: null,
  kioskUrl: 'https://alpha-kiosk.test',
};
function setup(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <WelcomePage token="test-invitation-token-for-alpha-000001" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('administrator welcome', () => {
  it('requires matching valid passwords, sends the host-bound invitation, and shows sign-in after success', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json({ ...ready, status: 'USED' }));
    setup(fetcher);
    await screen.findByText('admin@alpha.test');
    const submit = screen.getByRole('button', { name: t.submit });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(t.password), {
      target: { value: 'test-new-password-123' },
    });
    fireEvent.change(screen.getByLabelText(t.confirmPassword), {
      target: { value: 'different-password-123' },
    });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(t.confirmPassword), {
      target: { value: 'test-new-password-123' },
    });
    expect(submit.hasAttribute('disabled')).toBe(false);
    fireEvent.click(submit);
    await screen.findByRole('button', { name: t.signIn });
    const [, options] = fetcher.mock.calls[1] ?? [];
    expect(options?.credentials).toBe('omit');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      host: location.host,
      password: 'test-new-password-123',
    });
    expect(screen.queryByLabelText(t.password)).toBeNull();
    expect(screen.getByText(t.botPending)).not.toBeNull();
  });

  it('keeps password input after a failed save and permits an explicit retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(ready))
      .mockRejectedValueOnce(new TypeError('offline'));
    setup(fetcher);
    await screen.findByText('admin@alpha.test');
    fireEvent.change(screen.getByLabelText(t.password), {
      target: { value: 'test-new-password-123' },
    });
    fireEvent.change(screen.getByLabelText(t.confirmPassword), {
      target: { value: 'test-new-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.submit }));
    await screen.findByText(t.failed);
    expect(screen.getAllByDisplayValue('test-new-password-123')).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.submit }).hasAttribute('disabled')).toBe(false),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shows an expired-link explanation without a password form', async () => {
    setup(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await screen.findByText(t.invalid);
    expect(screen.queryByLabelText(t.password)).toBeNull();
  });
});
