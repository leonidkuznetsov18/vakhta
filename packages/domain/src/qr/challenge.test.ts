import { describe, expect, it } from 'vitest';
import {
  MAX_START_PARAM_LENGTH,
  buildDeepLink,
  challengeExpiresAt,
  isChallengeExpired,
  isValidStartParam,
} from './challenge.js';
import { generateChallengeToken, hashChallengeToken, hashesMatch } from './crypto.js';

describe('QR challenge (FR-QR-02, ADR-4)', () => {
  it('генерує 22-символьний base64url-токен без персональних даних', () => {
    const t = generateChallengeToken();
    expect(t).toHaveLength(22);
    expect(isValidStartParam(t)).toBe(true);
  });

  it('два токени не збігаються', () => {
    expect(generateChallengeToken()).not.toBe(generateChallengeToken());
  });

  it('хеш детермінований і не дорівнює токену', () => {
    const t = generateChallengeToken();
    expect(hashChallengeToken(t)).toBe(hashChallengeToken(t));
    expect(hashChallengeToken(t)).toHaveLength(64);
    expect(hashChallengeToken(t)).not.toBe(t);
  });

  it('T-05: підмінений токен не збігається з хешем', () => {
    const real = hashChallengeToken('abc');
    expect(hashesMatch(real, hashChallengeToken('abd'))).toBe(false);
    expect(hashesMatch(real, hashChallengeToken('abc'))).toBe(true);
    expect(hashesMatch(real, 'short')).toBe(false);
  });

  it('T-04: прострочений challenge відхиляється', () => {
    const issued = new Date('2026-09-05T05:00:00Z');
    const expires = challengeExpiresAt(issued, 90);
    expect(isChallengeExpired(expires, new Date('2026-09-05T05:01:29Z'))).toBe(false);
    expect(isChallengeExpired(expires, new Date('2026-09-05T05:01:30Z'))).toBe(true);
  });

  it('start-параметр не довший за 64 символи і лише base64url', () => {
    expect(isValidStartParam('a'.repeat(MAX_START_PARAM_LENGTH))).toBe(true);
    expect(isValidStartParam('a'.repeat(MAX_START_PARAM_LENGTH + 1))).toBe(false);
    expect(isValidStartParam('with space')).toBe(false);
    expect(isValidStartParam('plus+slash/')).toBe(false);
    expect(isValidStartParam('')).toBe(false);
  });

  it('deep link будується лише з коректного токена', () => {
    expect(buildDeepLink('VakhtaBot', 'AbC_-123')).toBe('https://t.me/VakhtaBot?start=AbC_-123');
    expect(() => buildDeepLink('VakhtaBot', 'bad token')).toThrow(RangeError);
  });
});
