import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { DictionarySnapshot } from '@vakhta/contracts';
import { dictionaryApi } from '../api/dictionary-api';
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
vi.mock('../api/dictionary-api', () => ({
  dictionaryApi: { search: vi.fn().mockResolvedValue({ items: [] }), details: vi.fn() },
  dictionaryKeys: {
    search: (q: string) => ['dictionary', q],
    details: (id: string) => ['dictionary-detail', id],
  },
}));
const t = messages(currentLocale()).checklistPhotoRules;
const d = messages(currentLocale()).photoDictionary;
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
    name: 'pallet',
    active: true,
    color: '#0a84ff',
  });
  render(<ChecklistPhotoRules definitionId="definition" />);
  fireEvent.click(await screen.findByRole('button', { name: t.editRules }));
  await screen.findByText(t.catalogEmpty);
  fireEvent.click(screen.getByRole('button', { name: d.manual }));
  expect(screen.getByRole('button', { name: d.add }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: d.englishName }), {
    target: { value: 'pallet' },
  });
  fireEvent.click(screen.getByRole('button', { name: d.add }));
  await waitFor(() => expect(rulesApi.createObject).toHaveBeenCalledWith({ name: 'pallet' }));
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
  expect((await screen.findByText('Стаканчики — крім гнізд машини')).closest('li')).not.toBeNull();
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
  fireEvent.change(screen.getByRole('combobox', { name: d.search }), {
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
  expect(screen.getByRole('combobox', { name: d.search }).getAttribute('value')).toBe('');
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

it('opens directly in edit mode without a second click and keeps Save disabled until changed', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, rules: [], canEdit: true });
  render(<ChecklistPhotoRules definitionId="historical-definition" initialMode="edit" />);
  const save = await screen.findByRole('button', { name: t.save });
  expect(save.hasAttribute('disabled')).toBe(true);
  expect(rulesApi.get).toHaveBeenCalledWith('historical-definition', expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: 'Ганчірки' }));
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(false);
});

it('keeps server-denied rules read-only even when a direct link requests edit mode', async () => {
  vi.mocked(rulesApi.objects).mockResolvedValue(catalog);
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, rules: [], canEdit: false });
  render(<ChecklistPhotoRules definitionId="definition" initialMode="edit" />);
  await screen.findByText(t.empty);
  expect(screen.queryByRole('button', { name: t.save })).toBeNull();
  expect(screen.queryByRole('button', { name: t.editRules })).toBeNull();
});

it('stores the selected English name and dictionary snapshot after multilingual search', async () => {
  const ball = DictionarySnapshot.parse({
    conceptId: 'Q18545',
    englishName: 'ball',
    labels: { ru: 'Мяч', uk: 'М’яч' },
    description: {},
    source: 'CURATED',
    aliases: [],
    variants: [],
    coverage: 'CURATED',
    retrievedAt: '2026-09-14T00:00:00Z',
  });
  vi.mocked(rulesApi.objects).mockResolvedValue({ objects: [], canEdit: true });
  vi.mocked(rulesApi.get).mockResolvedValue({ version: 0, rules: [], canEdit: true });
  vi.mocked(dictionaryApi.search).mockResolvedValue({ items: [ball] });
  vi.mocked(dictionaryApi.details).mockResolvedValue(ball);
  vi.mocked(rulesApi.createObject).mockResolvedValue({
    id: RAG,
    name: 'ball',
    active: true,
    color: '#0a84ff',
  });
  vi.mocked(rulesApi.save).mockRejectedValue(new Error('Offline'));
  render(<ChecklistPhotoRules definitionId="definition" initialMode="edit" />);
  fireEvent.change(await screen.findByRole('combobox', { name: d.search }), {
    target: { value: 'мяч' },
  });
  fireEvent.click(await screen.findByRole('option'));
  fireEvent.click(await screen.findByRole('button', { name: d.choose }));
  await waitFor(() => expect(rulesApi.createObject).toHaveBeenCalledWith({ name: 'ball' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() =>
    expect(rulesApi.save).toHaveBeenCalledWith('definition', {
      version: 0,
      rules: [{ objectId: RAG, note: '', dictionary: ball }],
    }),
  );
});
