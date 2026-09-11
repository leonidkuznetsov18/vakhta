import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { rulesApi } from '../api/rules-api';
import { ChecklistPhotoRules } from './checklist-photo-rules';
vi.mock('../api/rules-api', () => ({
  rulesApi: { get: vi.fn(), save: vi.fn() },
  rulesKey: (d: string, z: string) => ['rules', d, z],
}));
const t = messages(currentLocale()).checklistPhotoRules;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('saves simple per-zone objects and keeps edits after a failed save', async () => {
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, items: [], canEdit: true });
  vi.mocked(rulesApi.save)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ version: 1, items: ['Ганчірки'], canEdit: true });
  render(
    <ChecklistPhotoRules definitionId="definition" zones={[{ id: 'zone-a', name: 'Zone A' }]} />,
  );
  await screen.findByText(t.empty);
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ганчірки' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText('Offline');
  expect(screen.getByDisplayValue('Ганчірки')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText(t.saved);
  expect(rulesApi.save).toHaveBeenLastCalledWith('definition', 'zone-a', {
    version: 0,
    items: ['Ганчірки'],
    details: [],
  });
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  const duplicate = screen.getAllByRole('textbox')[1];
  if (!duplicate) throw new Error('Missing second input');
  fireEvent.change(duplicate, { target: { value: ' ганчірки ' } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true),
  );
  expect(screen.getByRole('alert').textContent).toBe(t.invalid);
});

it('adds a suggestion once and saves optional clarification and exceptions without losing them on failure', async () => {
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, items: [], canEdit: true });
  vi.mocked(rulesApi.save).mockRejectedValue(new Error('Offline'));
  render(
    <ChecklistPhotoRules definitionId="definition" zones={[{ id: 'zone-a', name: 'Zone A' }]} />,
  );
  const name = t.suggestions[2];
  if (!name) throw new Error('Missing suggestion');
  fireEvent.click(await screen.findByRole('button', { name }));
  expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.queryByLabelText(t.clarification)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: t.details }));
  fireEvent.change(screen.getByLabelText(t.clarification), {
    target: { value: 'Loose hand tools' },
  });
  fireEvent.change(screen.getByLabelText(t.exceptions), {
    target: { value: 'Fixed equipment parts' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText('Offline');
  expect(screen.getByDisplayValue('Fixed equipment parts')).toBeTruthy();
  expect(rulesApi.save).toHaveBeenCalledWith('definition', 'zone-a', {
    version: 0,
    items: [name],
    details: [
      { item: name, clarification: 'Loose hand tools', exceptions: 'Fixed equipment parts' },
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: t.remove }));
  expect(screen.getByRole('button', { name })).toBeTruthy();
});

it('reopens saved details collapsed and explicitly saves their removal', async () => {
  vi.mocked(rulesApi.get).mockResolvedValue({
    version: 2,
    items: ['Tools'],
    details: [{ item: 'Tools', clarification: '', exceptions: 'Fixed blade' }],
    canEdit: true,
  });
  vi.mocked(rulesApi.save).mockResolvedValue({
    version: 3,
    items: ['Tools'],
    details: [],
    canEdit: true,
  });
  render(
    <ChecklistPhotoRules definitionId="definition" zones={[{ id: 'zone-a', name: 'Zone A' }]} />,
  );
  fireEvent.click(await screen.findByRole('button', { name: t.detailsAdded }));
  expect(screen.getByDisplayValue('Fixed blade')).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t.exceptions), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText(t.saved);
  expect(rulesApi.save).toHaveBeenCalledWith('definition', 'zone-a', {
    version: 2,
    items: ['Tools'],
    details: [],
  });
});
