import { describe, expect, it } from 'vitest';
import { localeOf } from './locale.decorator.js';

describe('request locale', () => {
  it('prefers the explicit x-locale header over Accept-Language', () => {
    expect(localeOf({ headers: { 'x-locale': 'uk', 'accept-language': 'en-US' } })).toBe('uk');
  });

  it('falls back to Accept-Language and then to the default', () => {
    expect(localeOf({ headers: { 'accept-language': 'en-GB,en;q=0.9' } })).toBe('en');
    expect(localeOf({ headers: {} })).toBe('ru');
    expect(localeOf({ headers: { 'x-locale': 'xx' } })).toBe('ru');
  });
});
