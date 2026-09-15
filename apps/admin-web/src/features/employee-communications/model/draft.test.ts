import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createCommunicationDraft, draftCommand } from './draft';
const person = {
  id: 'b0000000-0000-4000-8000-000000000001',
  fullName: 'Synthetic worker',
  personnelNumber: '001',
};
afterEach(() => vi.restoreAllMocks());
describe('global communication draft', () => {
  it('preserves text and request identity when minimized and reopened', () => {
    const draft = createCommunicationDraft(createMemoryHistory());
    draft.open(person);
    draft.change({ text: 'Shift briefing' });
    const id = draft.store.getState().requestId;
    draft.minimize();
    draft.open();
    expect(draft.store.getState()).toMatchObject({
      open: true,
      text: 'Shift briefing',
      requestId: id,
      recipients: [person],
    });
    expect(draftCommand(draft.store.getState())?.text).toBe('Shift briefing');
  });
  it('requires explicit replacement when opening another employee', () => {
    const draft = createCommunicationDraft(createMemoryHistory());
    draft.open(person);
    draft.change({ text: 'Keep this draft' });
    draft.open({ ...person, id: 'b0000000-0000-4000-8000-000000000002' }, 'New text');
    expect(draft.store.getState().text).toBe('Keep this draft');
    expect(draft.store.getState().pendingContext).not.toBeNull();
    draft.replaceContext();
    expect(draft.store.getState().text).toBe('New text');
  });
  it('freezes content and recipients while the accepted outcome is unknown', () => {
    const draft = createCommunicationDraft(createMemoryHistory());
    draft.open(person);
    draft.change({ text: 'Original' });
    const command = draftCommand(draft.store.getState());
    draft.update({ phase: 'UNCERTAIN' });
    draft.change({ text: 'Changed' });
    draft.open(person, 'Changed by context');
    draft.toggle(person);
    expect(draftCommand(draft.store.getState())).toEqual(command);
  });
  it('ignores late uploads after removal and account disposal', () => {
    const draft = createCommunicationDraft(createMemoryHistory());
    const file = draft.addFile(new File(['content'], 'brief.pdf', { type: 'application/pdf' }));
    if (!file) throw new Error('Missing upload');
    draft.removeFile(file.id);
    expect(file.controller.signal.aborted).toBe(true);
    draft.finishFile(file.id, { error: new Error('Late upload') });
    expect(draft.store.getState().files).toEqual([]);
    draft.dispose();
    draft.update({ text: 'Old account response' });
    expect(draft.store.getState().text).toBe('');
  });
});

it('uses the router history for mobile Back without losing the draft or skipping a page', () => {
  const history = createMemoryHistory({
    initialEntries: ['/overview', '/schedule'],
    initialIndex: 1,
  });
  const media = window.matchMedia('(max-width: 767px)');
  vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
  const draft = createCommunicationDraft(history);
  draft.activate();
  draft.open(person);
  draft.change({ text: 'Keep this mobile draft' });
  expect(history.location.state.communicationDock).toBe(true);
  expect(history.location.state.__TSR_index).toBe(2);
  history.back();
  expect(history.location.pathname).toBe('/schedule');
  expect(history.location.state.__TSR_index).toBe(1);
  expect(draft.store.getState()).toMatchObject({ open: false, text: 'Keep this mobile draft' });
  draft.open();
  draft.minimize();
  expect(history.location.state.__TSR_index).toBe(1);
  history.back();
  expect(history.location.pathname).toBe('/overview');
  draft.dispose();
  history.destroy();
});
