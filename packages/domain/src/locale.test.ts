import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, resolveLocale } from './locale.js';

describe('resolveLocale', () => {
  it('maps Telegram and browser language tags to supported locales', () => {
    expect(resolveLocale('uk')).toBe('uk');
    expect(resolveLocale('uk-UA')).toBe('uk');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('ru')).toBe('ru');
  });

  it('walks an Accept-Language list and ignores quality weights', () => {
    expect(resolveLocale('de-DE,uk;q=0.8,en;q=0.5')).toBe('uk');
    expect(resolveLocale('de,fr')).toBe(DEFAULT_LOCALE);
  });

  it('falls back to the default for empty or unknown input', () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('pl')).toBe(DEFAULT_LOCALE);
  });
});
