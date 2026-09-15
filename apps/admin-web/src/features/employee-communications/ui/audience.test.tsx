import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { format, messages } from '@vakhta/i18n';
import { render } from '@/test-utils';
import { CommunicationProvider } from '../model/context';
import { communicationApi } from '../api/communications';
import { Audience } from './audience';
const t = messages('ru').communications;
const anna = {
  id: 'b0000000-0000-4000-8000-000000000001',
  fullName: 'Anna Smith',
  personnelNumber: '001',
  eligible: true,
  reason: null,
  unitName: 'Assembly',
};
const bob = {
  ...anna,
  id: 'b0000000-0000-4000-8000-000000000002',
  fullName: 'Bob Jones',
  personnelNumber: '002',
};
vi.mock('@/lib/org', () => ({
  useOrg: () => ({
    orgOrEmpty: { sites: [], orgUnits: [], teams: [] },
    queryState: {
      isPending: false,
      isFetching: false,
      isError: false,
      fetchStatus: 'idle',
      error: null,
      refetch: async () => undefined,
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('selects multiple employees from keyboard suggestions and removes chosen chips', async () => {
  vi.spyOn(communicationApi, 'audience').mockResolvedValue({
    items: [anna, bob],
    total: 2,
    page: 1,
  });
  render(
    <CommunicationProvider>
      <Audience />
    </CommunicationProvider>,
  );
  const input = screen.getByRole('combobox', { name: t.search });
  act(() => input.focus());
  await screen.findByRole('option', { name: /Anna Smith/ });
  fireEvent.keyDown(input, { key: 'Escape' });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.getAttribute('aria-activedescendant')).toBe(
    screen.getByRole('option', { name: /Bob Jones/ }).id,
  );
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('button', { name: format(t.removeRecipient, { name: bob.fullName }) });
  fireEvent.click(screen.getByRole('option', { name: /Anna Smith/ }));
  const remove = await screen.findByRole('button', {
    name: format(t.removeRecipient, { name: anna.fullName }),
  });
  fireEvent.click(remove);
  expect(
    screen.queryByRole('button', { name: format(t.removeRecipient, { name: anna.fullName }) }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: format(t.removeRecipient, { name: bob.fullName }) }),
  ).toBeTruthy();
});
it('keeps selection across search and disables unlinked suggestions', async () => {
  vi.spyOn(communicationApi, 'audience').mockImplementation(async (query) => ({
    items: query.search ? [{ ...bob, eligible: false, reason: 'UNLINKED' }] : [anna],
    total: 1,
    page: 1,
  }));
  render(
    <CommunicationProvider>
      <Audience />
    </CommunicationProvider>,
  );
  const input = screen.getByRole('combobox', { name: t.search });
  act(() => input.focus());
  fireEvent.click(await screen.findByRole('option', { name: /Anna Smith/ }));
  fireEvent.change(input, { target: { value: '002' } });
  const unavailable = await screen.findByRole('option', { name: /Bob Jones/ });
  expect(unavailable.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(unavailable);
  expect(
    screen.getByRole('button', { name: format(t.removeRecipient, { name: anna.fullName }) }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: format(t.removeRecipient, { name: bob.fullName }) }),
  ).toBeNull();
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'));
});
