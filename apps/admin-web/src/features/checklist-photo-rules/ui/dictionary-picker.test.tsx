import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { DictionarySnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { dictionaryApi } from '../api/dictionary-api';
import { DictionaryPicker } from './dictionary-picker';
vi.mock('../api/dictionary-api', () => ({
  dictionaryApi: { search: vi.fn(), details: vi.fn() },
  dictionaryKeys: {
    search: (q: string) => ['dictionary-search', q],
    details: (id: string) => ['dictionary-details', id],
  },
}));
const t = messages(currentLocale()).photoDictionary;
const ball = DictionarySnapshot.parse({
  conceptId: 'Q18545',
  englishName: 'ball',
  labels: { uk: 'М’яч', ru: 'Мяч' },
  description: {},
  source: 'CURATED',
  aliases: [],
  variants: [{ englishName: 'tennis ball', labels: {} }],
  coverage: 'CURATED',
  retrievedAt: '2026-09-14T00:00:00Z',
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('fills the selected English meaning only after a deliberate choice', async () => {
  vi.mocked(dictionaryApi.search).mockResolvedValue({ items: [ball] });
  vi.mocked(dictionaryApi.details).mockResolvedValue(ball);
  const choose = vi.fn();
  render(
    <DictionaryPicker
      value="мяч"
      onChange={vi.fn()}
      onChoose={choose}
      onManual={vi.fn()}
      disabled={false}
    />,
  );
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option'));
  await screen.findByText('tennis ball');
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: t.choose }));
  expect(choose).toHaveBeenCalledWith(ball);
});
it('does not apply details arriving after the search input changes', async () => {
  vi.mocked(dictionaryApi.search).mockResolvedValue({ items: [ball] });
  let resolve: (value: DictionarySnapshot) => void = () => {
    throw new Error('Not initialized');
  };
  vi.mocked(dictionaryApi.details).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const choose = vi.fn();
  const props = { onChange: vi.fn(), onChoose: choose, onManual: vi.fn(), disabled: false };
  const view = render(<DictionaryPicker value="мяч" {...props} />);
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option'));
  await waitFor(() => expect(dictionaryApi.details).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'door' } });
  view.rerender(<DictionaryPicker value="door" {...props} />);
  resolve(ball);
  await waitFor(() => expect(screen.queryByRole('button', { name: t.choose })).toBeNull());
  expect(choose).not.toHaveBeenCalled();
});
it('retains an English manual path when dictionary search fails', async () => {
  vi.mocked(dictionaryApi.search).mockRejectedValue(new Error('Offline'));
  const onManual = vi.fn();
  const props = { onChange: vi.fn(), onChoose: vi.fn(), onManual, disabled: false };
  const view = render(<DictionaryPicker value="unknown" {...props} />);
  fireEvent.focus(screen.getByRole('combobox'));
  await screen.findByText(t.unavailable);
  fireEvent.blur(screen.getByRole('combobox'), {
    relatedTarget: screen.getByRole('button', { name: t.manual }),
  });
  expect(screen.getByText(t.unavailable)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.manual }));
  view.rerender(<DictionaryPicker value="мяч" {...props} />);
  expect(screen.getByRole('button', { name: t.add }).hasAttribute('disabled')).toBe(true);
  view.rerender(<DictionaryPicker value="door" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  expect(onManual).toHaveBeenCalledWith('door');
});

it('retries unavailable subtype expansion without losing the selected meaning', async () => {
  vi.mocked(dictionaryApi.search).mockResolvedValue({ items: [ball] });
  vi.mocked(dictionaryApi.details)
    .mockResolvedValueOnce({ ...ball, variants: [], coverage: 'UNAVAILABLE' })
    .mockResolvedValueOnce(ball);
  render(
    <DictionaryPicker
      value="мяч"
      onChange={vi.fn()}
      onChoose={vi.fn()}
      onManual={vi.fn()}
      disabled={false}
    />,
  );
  fireEvent.focus(screen.getByRole('combobox', { name: t.search }));
  fireEvent.click(await screen.findByRole('option'));
  fireEvent.click(
    await screen.findByRole('button', { name: messages(currentLocale()).ui.common.retry }),
  );
  await screen.findByText('tennis ball');
  expect(dictionaryApi.details).toHaveBeenCalledTimes(2);
});
