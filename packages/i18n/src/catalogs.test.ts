import { describe, expect, it } from 'vitest';
import { LOCALES } from '@vakhta/domain';
import { catalogs, format, messages } from './index.js';

type Tree = Record<string, unknown>;

/** Flattens a catalog into "path -> string" so locales can be compared key by key. */
function flatten(node: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(prefix, node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => flatten(v, `${prefix}[${i}]`).forEach((s, k) => out.set(k, s)));
    return out;
  }
  for (const [key, value] of Object.entries(node as Tree)) {
    flatten(value, prefix ? `${prefix}.${key}` : key).forEach((s, k) => out.set(k, s));
  }
  return out;
}

const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('message catalogs', () => {
  const reference = flatten(catalogs.ru);

  it.each(LOCALES)('%s has exactly the same keys as ru', (locale) => {
    const keys = [...flatten(catalogs[locale]).keys()].sort();
    expect(keys).toEqual([...reference.keys()].sort());
  });

  it.each(LOCALES)('%s keeps the same placeholders in every string', (locale) => {
    const own = flatten(catalogs[locale]);
    const mismatches = [...reference]
      .filter(
        ([key, text]) => placeholders(text).join() !== placeholders(own.get(key) ?? '').join(),
      )
      .map(([key]) => key);
    expect(mismatches).toEqual([]);
  });

  it.each(LOCALES)('%s has no empty strings', (locale) => {
    const empty = [...flatten(catalogs[locale])].filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('messages() falls back to the default locale and format() substitutes placeholders', () => {
    expect(messages().admin.productName).toBe(catalogs.ru.admin.productName);
    expect(format(messages('en').shift.summaryLate, { minutes: 7 })).toBe('Late: 7 min.');
    expect(format('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });
});
