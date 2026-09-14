import { z } from 'zod';

export const MAX_DICTIONARY_VARIANTS = 40;
export const MAX_DICTIONARY_ALIASES = 12;
export const DictionaryLocale = z.enum(['uk', 'ru', 'en']);
export const DictionaryId = z.string().regex(/^Q[1-9][0-9]{0,11}$/u);
/** Latin spelling is a boundary check, not automatic proof of language or translation. */
export const EnglishObjectName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Zs}]+$/u)
  .regex(/[a-zA-Z]/u);
const translations = z.object({
  uk: z.string().trim().max(300).optional(),
  ru: z.string().trim().max(300).optional(),
  en: z.string().trim().max(300).optional(),
});
export const DictionaryVariant = z.object({ englishName: EnglishObjectName, labels: translations });
export type DictionaryVariant = z.infer<typeof DictionaryVariant>;
export const DictionaryConcept = DictionaryVariant.extend({
  conceptId: DictionaryId,
  description: translations,
  source: z.enum(['CURATED', 'WIKIDATA']),
});
export type DictionaryConcept = z.infer<typeof DictionaryConcept>;
export const DictionarySnapshot = DictionaryConcept.extend({
  aliases: z.array(EnglishObjectName).max(MAX_DICTIONARY_ALIASES),
  variants: z.array(DictionaryVariant).max(MAX_DICTIONARY_VARIANTS),
  excludedVariants: z.array(DictionaryVariant).max(MAX_DICTIONARY_VARIANTS).optional(),
  coverage: z.enum(['CURATED', 'DIRECT', 'LIMITED', 'UNAVAILABLE']),
  retrievedAt: z.iso.datetime(),
}).superRefine((value, ctx) => {
  const names = value.variants.map((item) => item.englishName.toLowerCase());
  if (new Set(names).size !== names.length || names.includes(value.englishName.toLowerCase()))
    ctx.addIssue({
      code: 'custom',
      path: ['variants'],
      message: 'Variants must be distinct from each other and the parent',
    });
  const excluded = (value.excludedVariants ?? []).map((item) => item.englishName.toLowerCase());
  if (
    new Set(excluded).size !== excluded.length ||
    excluded.some((name) => names.includes(name) || name === value.englishName.toLowerCase())
  )
    ctx.addIssue({
      code: 'custom',
      path: ['excludedVariants'],
      message:
        'Excluded variants must be unique and distinct from included variants and the parent',
    });
  if (new Set(value.aliases.map((name) => name.toLowerCase())).size !== value.aliases.length)
    ctx.addIssue({ code: 'custom', path: ['aliases'], message: 'Aliases must be unique' });
});
export type DictionarySnapshot = z.infer<typeof DictionarySnapshot>;
export const DictionarySearchQuery = z.object({
  q: z.string().trim().min(2).max(100),
  locale: DictionaryLocale,
});
export const DictionaryDetailsQuery = z.object({ locale: DictionaryLocale });
export const DictionarySearchResult = z.object({ items: z.array(DictionaryConcept).max(12) });
export type DictionarySearchResult = z.infer<typeof DictionarySearchResult>;
export function dictionaryLabel(
  item: DictionaryVariant,
  locale: z.infer<typeof DictionaryLocale>,
): string {
  return item.labels[locale] || item.englishName;
}
