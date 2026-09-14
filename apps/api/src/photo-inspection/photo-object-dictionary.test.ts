import { expect, it, vi } from 'vitest';
import {
  PhotoObjectDictionaryService,
  searchReviewedObjects,
} from './photo-object-dictionary.service.js';
import { WikidataDictionarySource } from './photo-object-dictionary-source.js';
const entity = (id: string, name = 'ladder') => ({
  id,
  labels: { en: { value: name } },
  descriptions: {},
  aliases: { en: [{ value: name }, { value: 'portable ladder' }] },
  claims: { P279: [{ mainsnak: { datavalue: { value: { id: 'Q223557' } } } }] },
});
const json = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
it('corrects supported multilingual names and keeps ambiguous cleaning meanings selectable', () => {
  for (const q of ['мяч', 'М’ЯЧ', "м'яч", 'мяяч', 'мячь', 'ball'])
    expect(searchReviewedObjects(q)[0]?.englishName).toBe('ball');
  for (const q of ['дверь', 'двері', 'двери', 'door'])
    expect(searchReviewedObjects(q)[0]?.englishName).toBe('door');
  expect(searchReviewedObjects('ганчірка').map((row) => row.conceptId)).toContain('Q1567420');
  expect(searchReviewedObjects('ганчірка').map((row) => row.conceptId)).toContain('Q1409430');
  expect(searchReviewedObjects('unrecognizablething')).toEqual([]);
});
it('serves reviewed meaning without needing the public service', async () => {
  const remote = { search: vi.fn(), details: vi.fn() };
  const service = new PhotoObjectDictionaryService(remote);
  expect((await service.search('мяч', 'uk')).items[0]?.englishName).toBe('ball');
  const details = await service.details('Q18545');
  expect(details.coverage).toBe('CURATED');
  expect(details.variants.map((row) => row.englishName)).toContain('tennis ball');
  expect(details.variants.map((row) => row.englishName)).not.toContain('hamster ball');
  expect(remote.details).not.toHaveBeenCalled();
});
it('hydrates English meanings, filters people and caches repeated searches', async () => {
  const person = {
    ...entity('Q5'),
    claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }] },
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: 'Q1' }, { id: 'Q5' }] }))
    .mockResolvedValueOnce(json({ entities: { Q1: entity('Q1'), Q5: person } }));
  const source = new WikidataDictionarySource(fetcher);
  expect((await source.search('ladder', 'en')).map((row) => row.englishName)).toEqual(['ladder']);
  await source.search('ladder', 'en');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('discloses bounded or unavailable expansion and deduplicates parent/subtypes', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ entities: { Q1: entity('Q1') } }))
    .mockResolvedValueOnce(
      json({
        query: { searchinfo: { totalhits: 45 }, search: [{ title: 'Q2' }, { title: 'Q3' }] },
        continue: {},
      }),
    )
    .mockResolvedValueOnce(
      json({ entities: { Q2: entity('Q2', 'step ladder'), Q3: entity('Q3', 'ladder') } }),
    );
  const result = await new WikidataDictionarySource(fetcher).details('Q1');
  expect(result.coverage).toBe('LIMITED');
  expect(result.variants).toHaveLength(1);
  const failed = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ entities: { Q1: entity('Q1') } }))
    .mockRejectedValueOnce(new Error('Offline'));
  expect((await new WikidataDictionarySource(failed).details('Q1')).coverage).toBe('UNAVAILABLE');
});
it('rejects malformed responses and honors provider cooldown without retries', async () => {
  let now = 0;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({}, 429, { 'retry-after': '120' }))
    .mockResolvedValueOnce(json({ search: [] }));
  const source = new WikidataDictionarySource(fetcher, () => now);
  await expect(source.search('ladder', 'en')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_UNAVAILABLE',
  });
  await expect(source.search('other', 'en')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_UNAVAILABLE',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  now = 121000;
  expect(await source.search('ladder', 'en')).toEqual([]);
  const invalid = new WikidataDictionarySource(
    vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 'maxlag' } })),
  );
  await expect(invalid.search('ladder', 'en')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_UNAVAILABLE',
  });
});
it('refuses a selected category without an English label', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      json({ entities: { Q1: { ...entity('Q1'), labels: { uk: { value: 'Драбина' } } } } }),
    );
  await expect(new WikidataDictionarySource(fetcher).details('Q1')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_NOT_FOUND',
  });
});

it('rejects corrupt hydrated entities instead of claiming no matches', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: 'Q1' }] }))
    .mockResolvedValueOnce(json({ entities: { Q1: { id: 'wrong' } } }));
  await expect(new WikidataDictionarySource(fetcher).search('ladder', 'en')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_UNAVAILABLE',
  });
});
it('requires a bounded path to a physical object, excluding mathematical namesakes', async () => {
  const graph = {
    ...entity('Q2', 'ladder graph'),
    claims: { P279: [{ mainsnak: { datavalue: { value: { id: 'Q3' } } } }] },
  };
  const abstract = { ...entity('Q3', 'graph'), claims: {} };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: 'Q1' }, { id: 'Q2' }] }))
    .mockResolvedValueOnce(json({ entities: { Q1: entity('Q1'), Q2: graph } }))
    .mockResolvedValueOnce(json({ entities: { Q3: abstract } }));
  expect(
    (await new WikidataDictionarySource(fetcher).search('ladder', 'en')).map(
      (row) => row.conceptId,
    ),
  ).toEqual(['Q1']);
});

it('recovers immediately after corrupt hydration without caching the invalid response', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: 'Q1' }] }))
    .mockResolvedValueOnce(json({ entities: { Q1: { id: 'wrong' } } }))
    .mockResolvedValueOnce(json({ entities: { Q1: entity('Q1') } }));
  const source = new WikidataDictionarySource(fetcher);
  await expect(source.search('ladder', 'en')).rejects.toMatchObject({
    code: 'PHOTO_DICTIONARY_UNAVAILABLE',
  });
  expect((await source.search('ladder', 'en'))[0]?.englishName).toBe('ladder');
  expect(fetcher).toHaveBeenCalledTimes(3);
});
