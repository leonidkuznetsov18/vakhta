import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { rulesApi } from '../api/rules-api';
import { ChecklistPhotoRules } from './checklist-photo-rules';
vi.mock('../api/rules-api', () => ({
  rulesApi: { get: vi.fn(), save: vi.fn(), objects: vi.fn(), createObject: vi.fn() },
  rulesKey: (d: string) => ['rules', d],
  photoObjectsKey: ['photo-objects'],
}));
const t = messages(currentLocale()).checklistPhotoRules;
const RAG = '40000000-0000-4000-8000-000000000001';
const CUP = '40000000-0000-4000-8000-000000000002';
const catalog = {
  objects: [
    { id: RAG, name: 'Ганчірки', active: true, color: '#0a84ff' },
    { id: CUP, name: 'Стаканчики', active: true, color: '#0a84ff' },
  ],
  canEdit: true,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('selects catalog objects for a checklist and keeps edits after a failed save', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, rules: [], canEdit: true });
  vi.mocked(rulesApi.save)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({
      version: 1,
      rules: [{ objectId: RAG, name: 'Ганчірки', note: 'на столі' }],
      canEdit: true,
    });
  render(<ChecklistPhotoRules definitionId="definition" />);
  await screen.findByText(t.empty);
  fireEvent.click(screen.getByRole('button', { name: 'Ганчірки' }));
  expect(screen.getByRole('status').textContent).toBe(`${t.dirty}: 1`);
  fireEvent.click(screen.getByRole('button', { name: t.note }));
  fireEvent.change(screen.getByLabelText(`${t.note}: Ганчірки`), { target: { value: 'на столі' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText('Offline');
  expect(screen.getByDisplayValue('на столі')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe(`${t.dirty}: 1`);
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await screen.findByText(t.saved);
  expect(screen.queryByText(new RegExp(`^${t.dirty}`))).toBeNull();
  expect(rulesApi.save).toHaveBeenLastCalledWith('definition', {
    version: 0,
    rules: [{ objectId: RAG, note: 'на столі' }],
  });
  fireEvent.click(screen.getByRole('button', { name: `${t.remove}: Ганчірки` }));
  await waitFor(() => expect(screen.getByText(t.empty)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Ганчірки' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
});
it('creates a catalog object once and adds it to the checklist list', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue({ objects: [], canEdit: true });
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, rules: [], canEdit: true });
  vi.mocked(rulesApi.createObject).mockResolvedValue({
    id: CUP,
    name: 'Піддони',
    active: true,
    color: '#0a84ff',
  });
  render(<ChecklistPhotoRules definitionId="definition" />);
  await screen.findByText(t.catalogEmpty);
  expect(screen.getByRole('button', { name: t.createObject }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: t.newObject }), {
    target: { value: 'Піддони' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.createObject }));
  await waitFor(() => expect(rulesApi.createObject).toHaveBeenCalledWith({ name: 'Піддони' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(false),
  );
});
it('shows a read-only list for viewers', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue({ ...catalog, canEdit: false });
  vi.mocked(rulesApi.get).mockResolvedValue({
    version: 2,
    rules: [{ objectId: CUP, name: 'Стаканчики', note: 'крім гнізд машини' }],
    canEdit: false,
  });
  render(<ChecklistPhotoRules definitionId="definition" />);
  expect((await screen.findByText('Стаканчики — крім гнізд машини')).tagName).toBe('LI');
  expect(screen.queryByRole('button', { name: t.save })).toBeNull();
});
