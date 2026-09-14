import { Inject, Injectable } from '@nestjs/common';
import {
  DictionaryConcept,
  DictionaryId,
  DictionarySnapshot,
  type DictionarySearchResult,
} from '@vakhta/contracts';
import { photoObjectVocabulary } from '@vakhta/i18n';
import { DICTIONARY_SOURCE, type DictionarySource } from './photo-object-dictionary-source.js';

export function normalizeObjectSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’ʼ`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
/** Conservative bounded-vocabulary edit distance; no automatic meaning selection. */
function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 0; i < left.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < right.length; j++)
      row.push(
        Math.min(
          (row[j] ?? 0) + 1,
          (previous[j + 1] ?? 0) + 1,
          (previous[j] ?? 0) + (left[i] === right[j] ? 0 : 1),
        ),
      );
    previous = row;
  }
  return previous[right.length] ?? left.length;
}
export function searchReviewedObjects(query: string): DictionaryConcept[] {
  const key = normalizeObjectSearch(query);
  if (key.length < 2) return [];
  return photoObjectVocabulary
    .map((entry) => {
      const names = [entry.englishName, ...Object.values(entry.labels), ...entry.searchAliases].map(
        normalizeObjectSearch,
      );
      const score = Math.min(
        ...names.map((name) =>
          name === key
            ? 0
            : name.startsWith(key)
              ? 1
              : key.length >= 4 &&
                  Math.abs(name.length - key.length) <= 1 &&
                  distance(name, key) <= 1
                ? 2
                : 9,
        ),
      );
      return { entry, score };
    })
    .filter((row) => row.score < 9)
    .sort(
      (a, b) => a.score - b.score || a.entry.englishName.localeCompare(b.entry.englishName, 'en'),
    )
    .slice(0, 12)
    .map(({ entry }) => DictionaryConcept.parse({ ...entry, source: 'CURATED' }));
}
@Injectable()
export class PhotoObjectDictionaryService {
  constructor(@Inject(DICTIONARY_SOURCE) private readonly source: DictionarySource) {}
  async search(q: string, locale: string): Promise<DictionarySearchResult> {
    const curated = searchReviewedObjects(q);
    if (curated.length) return { items: curated };
    return { items: await this.source.search(q, locale) };
  }
  async details(id: string): Promise<DictionarySnapshot> {
    DictionaryId.parse(id);
    const curated = photoObjectVocabulary.find((entry) => entry.conceptId === id);
    if (curated)
      return DictionarySnapshot.parse({
        ...curated,
        source: 'CURATED',
        coverage: 'CURATED',
        retrievedAt: '2026-09-14T00:00:00Z',
      });
    const detail = await this.source.details(id);
    return DictionarySnapshot.parse({
      ...detail.concept,
      aliases: detail.aliases,
      variants: detail.variants,
      coverage: detail.coverage,
      retrievedAt: new Date().toISOString(),
    });
  }
}
