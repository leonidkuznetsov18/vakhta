import { z } from 'zod';
import {
  DictionaryId,
  EnglishObjectName,
  type DictionaryConcept,
  type DictionaryVariant,
} from '@vakhta/contracts';
import { DomainError } from '../common/domain-error.js';

export const DICTIONARY_SOURCE = Symbol('DICTIONARY_SOURCE');
const Text = z.object({ value: z.string().max(2000) });
const Localized = z
  .union([z.record(z.string(), Text), z.array(z.never())])
  .transform((value) => (Array.isArray(value) ? {} : value));
const Entity = z.object({
  id: DictionaryId,
  labels: Localized.default({}),
  descriptions: Localized.default({}),
  aliases: z.union([z.record(z.string(), z.array(Text)), z.array(z.never())]).default({}),
  claims: z
    .record(
      z.string(),
      z.array(
        z.object({
          mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }),
        }),
      ),
    )
    .default({}),
});
type Entity = z.infer<typeof Entity>;
const Entities = z.object({ entities: z.record(z.string(), z.unknown()) });
const Search = z.object({ search: z.array(z.object({ id: DictionaryId })).max(12) });
const Children = z.object({
  query: z.object({
    search: z.array(z.object({ title: DictionaryId })).max(40),
    searchinfo: z.object({ totalhits: z.number().int().nonnegative() }),
  }),
  continue: z.unknown().optional(),
});
const BLOCKED_TYPES = new Set([
  'Q5',
  'Q4167410',
  'Q4167836',
  'Q11424',
  'Q16521',
  'Q43229',
  'Q486972',
  'Q17334923',
  'Q13406463',
  'Q571',
  'Q482994',
  'Q7889',
]);
function localized(values: Record<string, { value: string }>) {
  return Object.fromEntries(
    ['uk', 'ru', 'en'].flatMap((locale) =>
      values[locale] ? [[locale, values[locale].value.slice(0, 300)]] : [],
    ),
  );
}
function concept(entity: Entity): DictionaryConcept | null {
  const englishName = EnglishObjectName.safeParse(entity.labels.en?.value);
  if (!englishName.success) return null;
  const types = entity.claims.P31 ?? [];
  if (
    types.some((claim) => {
      const value = z.object({ id: z.string() }).safeParse(claim.mainsnak.datavalue?.value);
      return value.success && BLOCKED_TYPES.has(value.data.id);
    })
  )
    return null;
  // A subclass statement is a useful category signal, never a proof of physical-object semantics.
  if (!entity.claims.P279?.length) return null;
  return {
    conceptId: entity.id,
    englishName: englishName.data,
    labels: localized(entity.labels),
    description: localized(entity.descriptions),
    source: 'WIKIDATA',
  };
}
export interface DictionarySource {
  search(query: string, locale: string): Promise<DictionaryConcept[]>;
  details(id: string): Promise<{
    concept: DictionaryConcept;
    aliases: string[];
    variants: DictionaryVariant[];
    coverage: 'DIRECT' | 'LIMITED' | 'UNAVAILABLE';
  }>;
}
/** Owns bounded public-service requests, caching and shared-request lifetime. Never receives photos. */
export class WikidataDictionarySource implements DictionarySource {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private cooldownUntil = 0;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}
  private async request<T>(
    params: Record<string, string>,
    schema: z.ZodType<T>,
    deadline = this.now() + 6000,
  ): Promise<T> {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({ format: 'json', maxlag: '5', ...params }).toString();
    const key = url.href;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return schema.parse(cached.value);
    const existing = this.pending.get(key);
    if (existing) return schema.parse(await existing);
    if (this.now() < this.cooldownUntil || this.pending.size >= 2)
      throw new DomainError(
        'PHOTO_DICTIONARY_UNAVAILABLE',
        503,
        'Dictionary temporarily unavailable',
      );
    const work = this.fetchValidated(url, schema, deadline);
    this.pending.set(key, work);
    try {
      const value = await work;
      if (this.cache.size >= 256) {
        const first = this.cache.keys().next().value;
        if (first) this.cache.delete(first);
      }
      this.cache.set(key, { value, expires: this.now() + 3_600_000 });
      return value;
    } finally {
      this.pending.delete(key);
    }
  }
  private async fetchValidated<T>(url: URL, schema: z.ZodType<T>, deadline: number): Promise<T> {
    try {
      const response = await this.fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(Math.max(1, Math.min(6000, deadline - this.now()))),
        headers: {
          'User-Agent': 'VakhtaObjectDictionary/1.0 (https://github.com/leonidkuznetsov18/vakhta)',
          Accept: 'application/json',
        },
      });
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get('retry-after');
        const seconds = retry && /^\d+$/u.test(retry) ? Number(retry) : 0;
        const until = seconds ? this.now() + seconds * 1000 : retry ? Date.parse(retry) : NaN;
        this.cooldownUntil = Number.isFinite(until)
          ? Math.max(this.now() + 1000, until)
          : this.now() + 60_000;
      }
      if (!response.ok || !response.body) throw new Error('Dictionary HTTP failure');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 1_048_576) throw new Error('Dictionary payload too large');
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(raw);
      if (error.success) {
        if (error.data.error.code === 'maxlag' || error.data.error.code === 'ratelimited')
          this.cooldownUntil = this.now() + 60_000;
        throw new Error('Dictionary API failure');
      }
      return schema.parse(raw);
    } catch {
      throw new DomainError(
        'PHOTO_DICTIONARY_UNAVAILABLE',
        503,
        'Dictionary response unavailable or invalid',
      );
    }
  }
  private async entities(ids: string[], deadline = this.now() + 6000): Promise<Entity[]> {
    if (!ids.length) return [];
    const result = await this.request(
      {
        action: 'wbgetentities',
        ids: ids.join('|'),
        props: 'labels|descriptions|aliases|claims',
        languages: 'en|uk|ru',
      },
      Entities.superRefine((batch, ctx) => {
        for (const id of ids) {
          const raw = batch.entities[id];
          if (z.object({ missing: z.string() }).safeParse(raw).success) continue;
          const parsed = Entity.safeParse(raw);
          if (!parsed.success || parsed.data.id !== id)
            ctx.addIssue({
              code: 'custom',
              path: ['entities', id],
              message: 'Malformed dictionary entity',
            });
        }
      }),
      deadline,
    );
    return ids.flatMap((id) => {
      const raw = result.entities[id];
      if (z.object({ missing: z.string() }).safeParse(raw).success) return [];
      const parsed = Entity.safeParse(raw);
      if (!parsed.success || parsed.data.id !== id)
        throw new DomainError('PHOTO_DICTIONARY_UNAVAILABLE', 503, 'Malformed dictionary entity');
      return [parsed.data];
    });
  }
  /** Positive, bounded category evidence; uncertain/too-deep categories remain a manual entry. */
  private async physicalIds(rows: Entity[]): Promise<Set<string>> {
    const root = 'Q223557';
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    let frontier = rows;
    const deadline = this.now() + 8000;
    for (let depth = 0; depth < 5 && frontier.length; depth++) {
      for (const row of frontier) {
        visited.add(row.id);
        graph.set(
          row.id,
          (row.claims.P279 ?? []).flatMap((claim) => {
            const parent = z
              .object({ id: DictionaryId })
              .safeParse(claim.mainsnak.datavalue?.value);
            return parent.success ? [parent.data.id] : [];
          }),
        );
      }
      const needed = [...new Set(frontier.flatMap((row) => graph.get(row.id) ?? []))].filter(
        (id) => id !== root && !visited.has(id),
      );
      if (depth === 4 || this.now() >= deadline || visited.size >= 80) break;
      frontier = await this.entities(needed.slice(0, Math.min(40, 80 - visited.size)), deadline);
    }
    const reachesRoot = (id: string, seen: Set<string>): boolean => {
      if (id === root) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return (graph.get(id) ?? []).some((parent) => reachesRoot(parent, seen));
    };
    return new Set(rows.filter((row) => reachesRoot(row.id, new Set())).map((row) => row.id));
  }
  async search(query: string, locale: string): Promise<DictionaryConcept[]> {
    const found = await this.request(
      {
        action: 'wbsearchentities',
        search: query,
        language: locale,
        uselang: locale,
        type: 'item',
        limit: '8',
      },
      Search,
    );
    const rows = await this.entities(found.search.map((item) => item.id));
    const physical = await this.physicalIds(rows);
    return rows.flatMap((row) => {
      const item = physical.has(row.id) ? concept(row) : null;
      return item ? [item] : [];
    });
  }
  async details(id: string) {
    DictionaryId.parse(id);
    const [entity] = await this.entities([id]);
    const selected = entity ? concept(entity) : null;
    if (!entity || !selected || !(await this.physicalIds([entity])).has(entity.id))
      throw new DomainError(
        'PHOTO_DICTIONARY_NOT_FOUND',
        422,
        'No supported English object category',
      );
    const rawAliases = Array.isArray(entity.aliases) ? [] : (entity.aliases.en ?? []);
    const aliases = [
      ...new Set(
        rawAliases.flatMap((value) => {
          const name = EnglishObjectName.safeParse(value.value);
          return name.success ? [name.data.toLowerCase()] : [];
        }),
      ),
    ]
      .filter((name) => name !== selected.englishName.toLowerCase())
      .slice(0, 12);
    const result: Awaited<ReturnType<DictionarySource['details']>> = {
      concept: selected,
      aliases,
      variants: [],
      coverage: 'UNAVAILABLE',
    };
    try {
      const children = await this.request(
        {
          action: 'query',
          list: 'search',
          srsearch: `haswbstatement:P279=${id}`,
          srnamespace: '0',
          srlimit: '40',
          srinfo: 'totalhits',
          srprop: '',
        },
        Children,
      );
      const rows = await this.entities(children.query.search.map((item) => item.title));
      const physical = await this.physicalIds(rows);
      const names = new Set([selected.englishName.toLowerCase()]);
      result.variants = rows.flatMap((row) => {
        const item = physical.has(row.id) ? concept(row) : null;
        if (!item || names.has(item.englishName.toLowerCase())) return [];
        names.add(item.englishName.toLowerCase());
        return [{ englishName: item.englishName, labels: item.labels }];
      });
      result.coverage =
        children.continue !== undefined ||
        children.query.searchinfo.totalhits > result.variants.length
          ? 'LIMITED'
          : 'DIRECT';
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'PHOTO_DICTIONARY_UNAVAILABLE'))
        throw error;
      // Preserve the identified meaning but explicitly disclose unavailable expansion.
      result.coverage = 'UNAVAILABLE';
    }
    return result;
  }
}
