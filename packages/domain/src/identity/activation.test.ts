import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACTIVATION_CODE_ALPHABET,
  ACTIVATION_CODE_LENGTH,
  activationDeepLinkParam,
  codeFromDeepLink,
  employeeAccess,
  evaluateActivationCode,
  isActivationDeepLink,
  maskFullName,
  maskPersonnelNumber,
  normalizeActivationCode,
} from './activation.js';
import { activationHashesMatch, generateActivationCode, hashActivationCode } from './crypto.js';

const PEPPER = 'test-pepper-with-enough-length';

describe('код активації (ТЗ 2.2)', () => {
  it('генерується з дозволеного алфавіту потрібної довжини', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateActivationCode();
      expect(code).toHaveLength(ACTIVATION_CODE_LENGTH);
      for (const ch of code) expect(ACTIVATION_CODE_ALPHABET).toContain(ch);
      expect(normalizeActivationCode(code)).toBe(code);
    }
  });

  it('нормалізація прощає регістр, пробіли й дефіси, але не чужі символи', () => {
    expect(normalizeActivationCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeActivationCode('ABCD 2345')).toBe('ABCD2345');
    expect(normalizeActivationCode('ABCD234')).toBeNull();
    expect(normalizeActivationCode('ABCD23450')).toBeNull();
    expect(normalizeActivationCode('ABCD234O')).toBeNull();
    expect(normalizeActivationCode('ABCD234I')).toBeNull();
    expect(normalizeActivationCode('')).toBeNull();
  });

  it('deep link несе код із префіксом act- і вміщається в 64 символи (FR-QR-02)', () => {
    const code = generateActivationCode();
    const param = activationDeepLinkParam(code);
    expect(param.length).toBeLessThanOrEqual(64);
    expect(isActivationDeepLink(param)).toBe(true);
    expect(isActivationDeepLink(param.toLowerCase())).toBe(true);
    expect(codeFromDeepLink(param)).toBe(code);
    expect(isActivationDeepLink('act-')).toBe(false);
    expect(isActivationDeepLink('ABCD2345')).toBe(false);
    expect(codeFromDeepLink('qr-token-here')).toBeNull();
  });

  it('хеш детермінований, залежить від pepper і порівнюється безпечно', () => {
    const h1 = hashActivationCode('ABCD2345', PEPPER);
    expect(h1).toBe(hashActivationCode('ABCD2345', PEPPER));
    expect(h1).not.toBe(hashActivationCode('ABCD2345', `${PEPPER}-other`));
    expect(h1).not.toBe(hashActivationCode('ABCD2346', PEPPER));
    expect(activationHashesMatch(h1, hashActivationCode('ABCD2345', PEPPER))).toBe(true);
    expect(activationHashesMatch(h1, 'nope')).toBe(false);
    expect(() => hashActivationCode('ABCD2345', 'short')).toThrow(RangeError);
  });
});

describe('вердикт коду', () => {
  const base = {
    usedAt: null,
    expiresAt: new Date('2026-09-08T05:00:00Z'),
    attempts: 0,
    maxAttempts: 5,
  };
  const now = new Date('2026-09-05T05:00:00Z');

  it('дійсний код дає OK', () => {
    expect(evaluateActivationCode(base, now)).toBe('OK');
  });

  it('використаний код лишається використаним навіть після спливу строку', () => {
    expect(
      evaluateActivationCode(
        { ...base, usedAt: new Date('2026-09-05T06:00:00Z') },
        new Date('2026-09-09T00:00:00Z'),
      ),
    ).toBe('USED');
  });

  it('прострочений код і вичерпані спроби відхиляються', () => {
    expect(evaluateActivationCode(base, new Date('2026-09-08T05:00:00Z'))).toBe('EXPIRED');
    expect(evaluateActivationCode({ ...base, attempts: 5 }, now)).toBe('ATTEMPTS_EXCEEDED');
  });
});

describe('маскування картки (ТЗ 2.2)', () => {
  it('лишає прізвище та ініціали', () => {
    expect(maskFullName('Иванов Иван Иванович')).toBe('Иванов И. И.');
    expect(maskFullName('  Петренко   Олена ')).toBe('Петренко О.');
    expect(maskFullName('Мадонна')).toBe('Мадонна');
    expect(maskFullName('')).toBe('');
  });

  it('показує лише два останні символи табельного номера', () => {
    expect(maskPersonnelNumber('000123')).toBe('****23');
    expect(maskPersonnelNumber('A7')).toBe('**');
    expect(maskPersonnelNumber('7')).toBe('*');
  });

  it('property: маска ніколи не довша за оригінал і не розкриває початок номера', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length >= 3),
        (pn) => {
          const masked = maskPersonnelNumber(pn);
          expect(masked.length).toBe(pn.trim().length);
          expect(masked.startsWith('*')).toBe(true);
        },
      ),
    );
  });
});

describe('доступ до бота (FR-AUTH-01)', () => {
  it('лише ACTIVE отримує доступ', () => {
    expect(employeeAccess('ACTIVE')).toBe('ALLOWED');
    expect(employeeAccess('BLOCKED')).toBe('BLOCKED');
    expect(employeeAccess('TERMINATED')).toBe('TERMINATED');
    expect(employeeAccess(null)).toBe('NOT_REGISTERED');
    expect(employeeAccess(undefined)).toBe('NOT_REGISTERED');
  });
});
