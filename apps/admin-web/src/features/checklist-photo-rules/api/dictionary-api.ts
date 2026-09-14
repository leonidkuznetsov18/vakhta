import {
  DictionarySearchResult,
  DictionarySnapshot,
  DictionarySearchQuery,
  DictionaryDetailsQuery,
  DictionaryId,
} from '@vakhta/contracts';
import type { Locale } from '@vakhta/i18n';
import { apiFetch } from '@/api';
import { waitForSearch } from '@/shared/lib/search-delay';
const path = '/admin/photo-objects/dictionary';
export const dictionaryKeys = {
  search: (q: string, locale: Locale) => ['photo-object-dictionary', 'search', locale, q],
  details: (id: string | null, locale: Locale) => [
    'photo-object-dictionary',
    'details',
    locale,
    id,
  ],
};
export const dictionaryApi = {
  async search(q: string, locale: Locale, signal: AbortSignal) {
    const input = DictionarySearchQuery.parse({ q, locale });
    await waitForSearch(signal);
    return DictionarySearchResult.parse(
      await apiFetch(`${path}?${new URLSearchParams(input)}`, { signal }),
    );
  },
  async details(id: string, locale: Locale, signal: AbortSignal) {
    DictionaryId.parse(id);
    const query = DictionaryDetailsQuery.parse({ locale });
    return DictionarySnapshot.parse(
      await apiFetch(`${path}/${id}?${new URLSearchParams(query)}`, { signal }),
    );
  },
};
