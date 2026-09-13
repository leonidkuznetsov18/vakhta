import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { render } from '@/test-utils';
import { ApiError } from '@/api';
import { CommunicationProvider, useCommunicationDraft } from '../model/context';
import { communicationApi } from '../api/communications';
import { Compose } from './compose';
const t = messages('ru').communications;
const person = {
  id: 'b0000000-0000-4000-8000-000000000001',
  fullName: 'Synthetic employee',
  personnelNumber: '001',
  eligible: true,
  reason: null,
  unitName: null,
};
vi.mock('@/lib/org', () => ({
  useOrg: () => ({ orgOrEmpty: { sites: [], orgUnits: [], teams: [] } }),
}));
function Surface() {
  const draft = useCommunicationDraft();
  return (
    <>
      <button
        onClick={() => {
          draft.open(person);
          draft.change({ text: 'Test briefing' });
        }}
      >
        Prepare
      </button>
      <button onClick={() => draft.reset()}>Reset test draft</button>
      <Compose />
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps the same frozen command when an uncertain retry receives an authorization error', async () => {
  vi.spyOn(communicationApi, 'audience').mockResolvedValue({ items: [person], total: 1, page: 1 });
  const create = vi
    .spyOn(communicationApi, 'create')
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Sign in'));
  render(
    <CommunicationProvider>
      <Surface />
    </CommunicationProvider>,
  );
  fireEvent.click(screen.getByText('Prepare'));
  fireEvent.click(screen.getByRole('button', { name: t.send }));
  await screen.findByRole('button', { name: t.retry });
  expect(screen.getByLabelText(t.message).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t.retry }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.retry }).matches(':disabled')).toBe(false),
  );
  expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0]);
  expect(screen.getByLabelText(t.message).matches(':disabled')).toBe(true);
});
it('reviews a questionnaire even with only one recipient', async () => {
  vi.spyOn(communicationApi, 'audience').mockResolvedValue({ items: [person], total: 1, page: 1 });
  const create = vi.spyOn(communicationApi, 'create');
  render(
    <CommunicationProvider>
      <Surface />
    </CommunicationProvider>,
  );
  fireEvent.click(screen.getByText('Prepare'));
  fireEvent.click(screen.getByRole('button', { name: t.addQuestionnaire }));
  fireEvent.change(screen.getByLabelText(t.questionnaireTitle), {
    target: { value: 'Test questionnaire' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: `${t.question} 1` }), {
    target: { value: 'What can improve?' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.review }));
  expect(screen.getByText(t.namedPreview)).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});
it('ignores a bulk selection result after the original draft was discarded', async () => {
  vi.spyOn(communicationApi, 'audience').mockResolvedValue({ items: [person], total: 1, page: 1 });
  let finish: (value: { items: (typeof person)[]; total: number; page: number }) => void = () => {
    throw new Error('Selection not started');
  };
  vi.spyOn(communicationApi, 'all').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <CommunicationProvider>
      <Surface />
    </CommunicationProvider>,
  );
  const all = await screen.findByRole('button', { name: t.selectAll });
  await waitFor(() => expect(all.matches(':disabled')).toBe(false));
  fireEvent.click(all);
  await waitFor(() => expect(communicationApi.all).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Reset test draft'));
  finish({ items: [person], total: 1, page: 1 });
  await waitFor(() => expect(all.matches(':disabled')).toBe(false));
  expect(screen.getByText(t.selected.replace('{count}', '0'))).toBeTruthy();
});
