import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { render } from '@/test-utils';
import { CommunicationProvider } from '../model/context';
import { communicationApi } from '../api/communications';
import { CommunicationLauncher, CommunicationWorkspace } from './workspace';
const t = messages('ru').communications;
vi.mock('@/lib/org', () => ({
  useOrg: () => ({ orgOrEmpty: { sites: [], orgUnits: [], teams: [] } }),
}));
vi.mock('@/navigation', () => ({ useNavigation: () => ({ roles: ['ADMIN'], actorId: 'qa' }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('closes on outside interaction without a backdrop and preserves the draft', async () => {
  vi.spyOn(communicationApi, 'audience').mockResolvedValue({ items: [], total: 0, page: 1 });
  render(
    <CommunicationProvider>
      <button>Outside</button>
      <CommunicationLauncher />
      <CommunicationWorkspace />
    </CommunicationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: t.compose }));
  await screen.findByRole('dialog', { name: t.title });
  expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
  fireEvent.popState(window, { state: null });
  expect(screen.getByRole('dialog', { name: t.title })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t.message), { target: { value: 'Keep this message' } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.pointerDown(screen.getByText('Outside'), { pointerType: 'mouse' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: t.title })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: t.restore }));
  expect(
    screen.getByLabelText(t.message).getAttribute('value') ??
      screen.getByLabelText(t.message).textContent,
  ).toBe('Keep this message');
  const input = screen.getByRole('combobox', { name: t.search });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByRole('dialog', { name: t.title })).toBeTruthy();
  expect(input.getAttribute('aria-expanded')).toBe('false');
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: t.title })).toBeNull());
});
