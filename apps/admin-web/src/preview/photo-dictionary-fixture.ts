import { DictionaryConcept, DictionarySnapshot, type PhotoObjectsView } from '@vakhta/contracts';
import { photoObjectVocabulary } from '@vakhta/i18n';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
/** Deterministic vocabulary preview; never calls the public API or pretends to persist. */
export function dictionaryFixture(path: string, search: string): Response | null {
  if (!path.startsWith('/admin/photo-objects/dictionary')) return null;
  if (new URLSearchParams(window.location.search).get('dictionary') === 'failure')
    return json(
      { code: 'PHOTO_DICTIONARY_UNAVAILABLE', message: 'Dictionary preview failure' },
      503,
    );
  const id = path.split('/').at(-1);
  const normalize = (value: string) => value.toLowerCase().replace(/['’ʼ]/gu, '');
  const q = normalize(new URLSearchParams(search).get('q') ?? '');
  if (id === 'dictionary')
    return json({
      items: photoObjectVocabulary
        .filter((row) =>
          [row.englishName, ...Object.values(row.labels), ...row.searchAliases].some((name) =>
            normalize(name).includes(q),
          ),
        )
        .slice(0, 12)
        .map((row) => DictionaryConcept.parse({ ...row, source: 'CURATED' })),
    });
  const found = photoObjectVocabulary.find((row) => row.conceptId === id);
  return found
    ? json(
        DictionarySnapshot.parse({
          ...found,
          source: 'CURATED',
          coverage: 'CURATED',
          retrievedAt: '2026-09-14T00:00:00Z',
        }),
      )
    : json({ code: 'PHOTO_DICTIONARY_NOT_FOUND' }, 422);
}
export function dictionaryPreviewObjects(view: PhotoObjectsView): PhotoObjectsView {
  if (!new URLSearchParams(window.location.search).has('dictionary')) return view;
  return {
    ...view,
    objects: [
      ...view.objects,
      { id: '40000000-0000-4000-8000-000000000099', name: 'ball', active: true, color: '#1769aa' },
    ],
  };
}
