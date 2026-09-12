import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { rulesApi } from '../api/rules-api';
import { ChecklistPhotoRules } from './checklist-photo-rules';
vi.mock('../api/rules-api', () => ({
  rulesApi: {
    get: vi.fn(),
    save: vi.fn(),
    objects: vi.fn(),
    createObject: vi.fn(),
    updateObject: vi.fn(),
  },
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
  fireEvent.click(await screen.findByRole('button', { name: t.editRules }));
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
  fireEvent.click(await screen.findByRole('button', { name: t.editRules }));
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
it('renames and retires catalog objects from the edit mode after confirmation', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({
    version: 1,
    rules: [{ objectId: CUP, name: 'Стаканчики', note: '' }],
    canEdit: true,
  });
  vi.mocked(rulesApi.updateObject).mockImplementation(async (id, input) => ({
    id,
    name: input.name ?? 'Стаканчики',
    active: input.active ?? true,
    color: '#0a84ff',
  }));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<ChecklistPhotoRules definitionId="definition" />);
  fireEvent.click(await screen.findByRole('button', { name: t.editRules }));
  fireEvent.click(screen.getByRole('button', { name: t.catalogEdit }));
  const input = screen.getByRole('textbox', { name: 'Ганчірки' });
  expect(
    screen.getByRole('button', { name: `${t.renameSave}: Ганчірки` }).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.change(input, { target: { value: 'Ганчірка' } });
  fireEvent.click(screen.getByRole('button', { name: `${t.renameSave}: Ганчірки` }));
  await waitFor(() =>
    expect(rulesApi.updateObject).toHaveBeenCalledWith(RAG, { name: 'Ганчірка' }),
  );
  // A declined confirmation keeps the object; an accepted one retires it and drops it from the list.
  fireEvent.click(screen.getByRole('button', { name: `${t.deleteObject}: Стаканчики` }));
  expect(rulesApi.updateObject).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: `${t.deleteObject}: Стаканчики` }));
  await waitFor(() => expect(rulesApi.updateObject).toHaveBeenCalledWith(CUP, { active: false }));
  await waitFor(() => expect(screen.queryByText('Стаканчики', { selector: 'strong' })).toBeNull());
  confirm.mockRestore();
});

it('starts with saved rules and protects both rule and catalog drafts when finishing editing', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({
    version: 1,
    rules: [{ objectId: CUP, name: 'Стаканчики', note: 'Saved note' }],
    canEdit: true,
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<ChecklistPhotoRules definitionId="definition" />);
  await screen.findByText('Стаканчики — Saved note');
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: t.editRules }));
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: t.newObject }), {
    target: { value: 'Unfinished object' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.viewRules }));
  expect(confirm).toHaveBeenCalledWith(t.discard);
  expect(screen.getByDisplayValue('Unfinished object')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.note }));
  fireEvent.change(screen.getByLabelText(`${t.note}: Стаканчики`), {
    target: { value: 'Draft note' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.viewRules }));
  expect(screen.getByDisplayValue('Draft note')).toBeTruthy();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: t.viewRules }));
  expect(screen.getByText('Стаканчики — Saved note')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.editRules }));
  expect(screen.getByRole('textbox', { name: t.newObject }).getAttribute('value')).toBe('');
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
  expect(rulesApi.save).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it('shows refreshed catalog names when returning to saved rules after a rename', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({
    version: 1,
    rules: [{ objectId: CUP, name: 'Стаканчики', note: 'Saved note' }],
    canEdit: true,
  });
  vi.mocked(rulesApi.updateObject).mockResolvedValue({
    id: CUP,
    name: 'Стаканчик',
    color: '#0a84ff',
    active: true,
  });
  render(<ChecklistPhotoRules definitionId="definition" />);
  fireEvent.click(await screen.findByRole('button', { name: t.editRules }));
  fireEvent.click(screen.getByRole('button', { name: t.catalogEdit }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Стаканчики' }), {
    target: { value: 'Стаканчик' },
  });
  vi.mocked(rulesApi.objects).mockResolvedValue({
    ...catalog,
    objects: catalog.objects.map((object) =>
      object.id === CUP ? { ...object, name: 'Стаканчик' } : object,
    ),
  });
  fireEvent.click(screen.getByRole('button', { name: `${t.renameSave}: Стаканчики` }));
  await screen.findByRole('textbox', { name: 'Стаканчик' });
  fireEvent.click(screen.getByRole('button', { name: t.viewRules }));
  expect(screen.getByText('Стаканчик — Saved note')).toBeTruthy();
});
