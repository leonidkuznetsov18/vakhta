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
